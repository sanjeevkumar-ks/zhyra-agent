"""
Google Maps Integration Provider
===================================
Real implementation using Google Maps Python Client.

Authentication: API Key (server-side, no OAuth required)
Credentials stored: api_key (encrypted via credential_store)

Capabilities:
  - Search places
  - Estimate routes
  - Check distances
  - Suggest nearby locations
"""

import json
from app.integrations.providers.base_provider import BaseIntegrationProvider
from app.integrations.credential_store import save_credentials, load_credentials, delete_credentials
from app.database.firestore import firestore_client
from app.utils.logger import log_info, log_error
from fastapi import HTTPException


class GoogleMapsProvider(BaseIntegrationProvider):

    INTEGRATION_ID = "int_google_maps"

    def _get_client(self, creds: dict):
        try:
            import googlemaps
            api_key = creds.get("api_key", "")
            if not api_key:
                raise HTTPException(status_code=400, detail="Google Maps API Key is missing.")
            return googlemaps.Client(key=api_key)
        except ImportError:
            raise HTTPException(status_code=500, detail="googlemaps package not installed. Run: pip install googlemaps")

    async def connect(self, workspace_id: str, payload: dict) -> dict:
        config = payload.get("configuration", {})
        credentials = payload.get("credentials", {})

        api_key = (
            config.get("api_key")
            or credentials.get("api_key")
            or credentials.get("key")
        )

        if not api_key:
            raise HTTPException(status_code=400, detail="Google Maps API Key is required.")

        # Validate API key
        await self.validate(config, {"api_key": api_key})

        # Store encrypted
        save_credentials(workspace_id, self.INTEGRATION_ID, {"api_key": api_key})

        doc_ref = firestore_client.collection("integrations").document(f"{workspace_id}_{self.INTEGRATION_ID}")
        integration_data = {
            "id": self.INTEGRATION_ID,
            "workspace_id": workspace_id,
            "connected": True,
            "synced_agents": payload.get("synced_agents", []),
            "last_sync": "Just now",
            "health": 100,
            "config": {},  # Never store API key in config
            "connected_account": payload.get("connected_account") or "Google Cloud API Key",
        }
        doc_ref.set(integration_data, merge=True)
        log_info(f"Google Maps connected for workspace {workspace_id}")
        return integration_data

    async def disconnect(self, workspace_id: str) -> None:
        delete_credentials(workspace_id, self.INTEGRATION_ID)
        doc_ref = firestore_client.collection("integrations").document(f"{workspace_id}_{self.INTEGRATION_ID}")
        doc_ref.delete()
        log_info(f"Google Maps disconnected for workspace {workspace_id}")

    async def validate(self, config: dict, credentials: dict) -> bool:
        api_key = credentials.get("api_key", config.get("api_key", ""))
        if not api_key:
            raise HTTPException(status_code=400, detail="Google Maps API Key is required.")

        try:
            import googlemaps
            client = googlemaps.Client(key=api_key)
            # Minimal validation: geocode a known address
            result = client.geocode("Mountain View, CA")
            if not result:
                raise HTTPException(status_code=400, detail="Google Maps API key validation returned no results.")
            return True
        except ImportError:
            raise HTTPException(status_code=500, detail="googlemaps package not installed.")
        except HTTPException:
            raise
        except Exception as e:
            error_str = str(e).lower()
            if "request denied" in error_str or "invalid key" in error_str or "api key" in error_str:
                raise HTTPException(status_code=400, detail="Invalid Google Maps API Key. Ensure the Maps Platform APIs are enabled.")
            log_error("Google Maps validation failed", exc=e)
            raise HTTPException(status_code=400, detail=f"Google Maps validation failed: {str(e)}")

    async def refresh(self, workspace_id: str) -> dict:
        # API keys don't expire
        return {}

    async def execute(self, workspace_id: str, method: str, args: dict) -> str:
        creds = load_credentials(workspace_id, self.INTEGRATION_ID)
        if not creds or not creds.get("api_key"):
            return "Error: Google Maps is not connected. Please configure API key first."

        try:
            client = self._get_client(creds)
            method_lower = method.lower()

            if "search" in method_lower or "place" in method_lower or "nearby" in method_lower:
                return await self._search_places(client, args)
            elif "route" in method_lower or "direction" in method_lower:
                return await self._get_directions(client, args)
            elif "distance" in method_lower or "matrix" in method_lower:
                return await self._distance_matrix(client, args)
            elif "geocode" in method_lower or "address" in method_lower:
                return await self._geocode(client, args)
            elif "reverse" in method_lower:
                return await self._reverse_geocode(client, args)

            return f"Error: Unknown method '{method}' on Google Maps. Available: search_places, directions, distance_matrix, geocode, reverse_geocode"

        except Exception as e:
            log_error(f"Google Maps execute failed for method {method}", exc=e)
            return f"Error: Google Maps action failed — {str(e)}"

    async def _search_places(self, client, args: dict) -> str:
        query = args.get("query", args.get("search", ""))
        location = args.get("location", None)
        radius = int(args.get("radius", 5000))  # in meters
        place_type = args.get("type", args.get("place_type", ""))

        if not query and not location:
            return "Error: query or location is required."

        if location and isinstance(location, str):
            # Geocode the location string first
            geocode_result = client.geocode(location)
            if geocode_result:
                loc = geocode_result[0]["geometry"]["location"]
                location = (loc["lat"], loc["lng"])

        if location:
            params = {"location": location, "radius": radius, "query": query}
            if place_type:
                params["type"] = place_type
            results = client.places_nearby(**{k: v for k, v in params.items() if v})["results"]
        else:
            results = client.places(query=query).get("results", [])

        if not results:
            return f"No places found for '{query}'."

        formatted = []
        for place in results[:10]:  # Limit to 10 results
            formatted.append({
                "name": place.get("name"),
                "address": place.get("vicinity", place.get("formatted_address", "")),
                "rating": place.get("rating"),
                "total_ratings": place.get("user_ratings_total"),
                "open_now": place.get("opening_hours", {}).get("open_now"),
                "place_id": place.get("place_id"),
            })
        return f"Google Maps Places Results for '{query}' ({len(formatted)} found):\n{json.dumps(formatted, indent=2)}"

    async def _get_directions(self, client, args: dict) -> str:
        origin = args.get("origin", args.get("from", ""))
        destination = args.get("destination", args.get("to", ""))
        mode = args.get("mode", "driving")  # driving, walking, bicycling, transit
        waypoints = args.get("waypoints", [])

        if not origin or not destination:
            return "Error: origin and destination are required."

        params = {"origin": origin, "destination": destination, "mode": mode}
        if waypoints:
            params["waypoints"] = waypoints

        directions = client.directions(**params)
        if not directions:
            return f"No route found from '{origin}' to '{destination}'."

        route = directions[0]
        legs = route.get("legs", [])
        if not legs:
            return "No legs found in route."

        leg = legs[0]
        steps = [
            {"instruction": step.get("html_instructions", "").replace("<b>", "").replace("</b>", ""),
             "distance": step.get("distance", {}).get("text"),
             "duration": step.get("duration", {}).get("text")}
            for step in leg.get("steps", [])[:10]  # First 10 steps
        ]

        result = {
            "origin": leg.get("start_address"),
            "destination": leg.get("end_address"),
            "total_distance": leg.get("distance", {}).get("text"),
            "total_duration": leg.get("duration", {}).get("text"),
            "mode": mode,
            "steps": steps,
        }
        return f"Google Maps Directions:\n{json.dumps(result, indent=2)}"

    async def _distance_matrix(self, client, args: dict) -> str:
        origins = args.get("origins", [args.get("origin", "")])
        destinations = args.get("destinations", [args.get("destination", "")])
        mode = args.get("mode", "driving")

        if isinstance(origins, str):
            origins = [origins]
        if isinstance(destinations, str):
            destinations = [destinations]

        if not any(origins) or not any(destinations):
            return "Error: origins and destinations are required."

        result = client.distance_matrix(origins, destinations, mode=mode)

        rows = result.get("rows", [])
        if not rows:
            return "No distance data returned."

        formatted = []
        for i, row in enumerate(rows):
            for j, element in enumerate(row.get("elements", [])):
                formatted.append({
                    "origin": result.get("origin_addresses", [origins[i] if i < len(origins) else ""])[i] if i < len(result.get("origin_addresses", [])) else origins[i],
                    "destination": result.get("destination_addresses", [destinations[j] if j < len(destinations) else ""])[j] if j < len(result.get("destination_addresses", [])) else destinations[j],
                    "distance": element.get("distance", {}).get("text", "N/A"),
                    "duration": element.get("duration", {}).get("text", "N/A"),
                    "status": element.get("status"),
                })

        return f"Google Maps Distance Matrix:\n{json.dumps(formatted, indent=2)}"

    async def _geocode(self, client, args: dict) -> str:
        address = args.get("address", args.get("query", ""))
        if not address:
            return "Error: address is required for geocoding."

        results = client.geocode(address)
        if not results:
            return f"No geocoding results for '{address}'."

        result = results[0]
        location = result.get("geometry", {}).get("location", {})
        return json.dumps({
            "formatted_address": result.get("formatted_address"),
            "lat": location.get("lat"),
            "lng": location.get("lng"),
            "place_id": result.get("place_id"),
        }, indent=2)

    async def _reverse_geocode(self, client, args: dict) -> str:
        lat = args.get("lat", args.get("latitude"))
        lng = args.get("lng", args.get("longitude"))

        if lat is None or lng is None:
            return "Error: lat and lng are required for reverse geocoding."

        results = client.reverse_geocode((float(lat), float(lng)))
        if not results:
            return f"No address found for coordinates ({lat}, {lng})."

        return json.dumps({
            "formatted_address": results[0].get("formatted_address"),
            "place_id": results[0].get("place_id"),
        }, indent=2)

    def capabilities(self) -> list:
        return ["Search places", "Estimate routes", "Check distances", "Suggest nearby locations"]
