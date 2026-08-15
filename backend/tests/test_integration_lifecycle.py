import unittest
import asyncio
import sys
import os

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.services.integration_service import IntegrationService
from app.integrations.credential_store import save_credentials, load_credentials, delete_credentials

class TestIntegrationLifecycle(unittest.TestCase):

    def setUp(self):
        self.workspace_id = "test_workspace_lifecycle"
        self.integration_id = "int_gcal"

    def test_list_integrations(self):
        items = asyncio.run(IntegrationService.list_integrations(self.workspace_id))
        self.assertTrue(isinstance(items, list))
        self.assertTrue(len(items) > 0)
        gcal = next((item for item in items if item["id"] == self.integration_id), None)
        self.assertIsNotNone(gcal)
        self.assertEqual(gcal["name"], "Google Calendar")

    def test_connect_and_disconnect_lifecycle(self):
        # 1. Save dummy credentials
        dummy_creds = {"access_token": "test_token_123", "refresh_token": "test_refresh_123", "expires_at": 9999999999}
        save_credentials(self.workspace_id, self.integration_id, dummy_creds)

        # 2. Call connect_integration
        payload = {
            "credentials": {},
            "configuration": {},
            "synced_agents": ["agent_test_1"],
            "connected_account": "user@example.com"
        }
        conn_res = asyncio.run(IntegrationService.connect_integration(self.workspace_id, self.integration_id, payload))
        self.assertTrue(conn_res.get("connected"))
        self.assertEqual(conn_res.get("connected_account"), "user@example.com")

        # 3. Call disconnect_integration
        asyncio.run(IntegrationService.disconnect_integration(self.workspace_id, self.integration_id))
        creds_after = load_credentials(self.workspace_id, self.integration_id)
        self.assertIsNone(creds_after)

if __name__ == "__main__":
    unittest.main()
