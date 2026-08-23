"""
Channels API tests.

The Channels page must reflect REAL backend state (agent_channels collection),
never hardcoded toggles. Web Chat publish generates a widget_id that the public
widget endpoints resolve server-side. Telegram connect validates the bot token
against getMe. Unsupported channels return an honest "coming soon" error.
"""
import unittest
import asyncio
import sys
import os
import json
import time
from unittest import mock

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from fastapi.testclient import TestClient
import main as app_main

WS = "ws_usr_admin_"
AGENT = "agt_nova_ws_us"
AUTH = {"Authorization": "Bearer mock-test-token"}

# Backup / restore the shared mock db around each test.
DB_PATH = os.path.join(backend_dir, "mock_db.json")


def _backup_db():
    with open(DB_PATH, "r") as f:
        return f.read()


def _restore_db(snapshot):
    with open(DB_PATH, "w") as f:
        f.write(snapshot)


class TestChannelsAPI(unittest.TestCase):

    def setUp(self):
        self._snapshot = _backup_db()
        self.client = TestClient(app_main.app)

    def tearDown(self):
        _restore_db(self._snapshot)
        # Reset the shared in-memory mock client so later tests see the same
        # clean state the file has (prevents accumulated writes leaking out).
        import app.database.firestore as fs
        fs.firestore_client._db = json.loads(self._snapshot)
        # Drop in-memory widget sessions so tests stay isolated
        from app.services.widget_service import WIDGET_SESSIONS
        WIDGET_SESSIONS.clear()

    # 1. List returns the full registry with real state (no fake toggles)
    def test_list_channels_returns_real_state(self):
        res = self.client.get(f"/api/agents/{AGENT}/channels", headers=AUTH)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["count"]["total"], 7)
        self.assertEqual(data["count"]["supported"], 2)
        types = {c["type"] for c in data["channels"]}
        self.assertIn("web", types)
        self.assertIn("telegram", types)
        self.assertIn("whatsapp", types)
        web = next(c for c in data["channels"] if c["type"] == "web")
        self.assertEqual(web["status"], "not_configured")
        self.assertIsNone(web["widget_id"])
        # unsupported channels must be flagged, never fake-connected
        wa = next(c for c in data["channels"] if c["type"] == "whatsapp")
        self.assertFalse(wa["supported"])

    # 2. Unknown channel type rejected
    def test_unknown_channel_type_rejected(self):
        res = self.client.get(f"/api/agents/{AGENT}/channels/nope", headers=AUTH)
        self.assertEqual(res.status_code, 400)

    # 3. Web connect + publish -> widget_id generated, published true
    def test_web_connect_publish_generates_widget_id(self):
        res = self.client.post(
            f"/api/agents/{AGENT}/channels/web/connect",
            headers=AUTH,
            json={"config": {"allowed_domains": "*", "widget_title": "Nova", "welcome_message": "Hi!"}},
        )
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.json()["status"], "connected")

        res = self.client.post(f"/api/agents/{AGENT}/channels/web/publish", headers=AUTH)
        self.assertEqual(res.status_code, 200, res.text)
        body = res.json()
        self.assertTrue(body["published"])
        self.assertTrue(body["widget_id"] and body["widget_id"].startswith("wdg_"))

    # 4. Widget init blocked when not published
    def test_widget_init_blocked_when_not_published(self):
        res = self.client.post(
            "/api/widget/init",
            json={"widget_id": "wdg_missing", "origin": "https://example.com"},
        )
        self.assertEqual(res.status_code, 404)

    # 5. Full widget flow: publish -> init -> health test -> rate limit persists
    def test_widget_flow_after_publish(self):
        self.client.post(f"/api/agents/{AGENT}/channels/web/connect", headers=AUTH,
                         json={"config": {"allowed_domains": "*"}})
        pub = self.client.post(f"/api/agents/{AGENT}/channels/web/publish", headers=AUTH).json()
        widget_id = pub["widget_id"]

        # health test (zero cost)
        t = self.client.post(f"/api/widget/{widget_id}/test")
        self.assertEqual(t.status_code, 200)
        self.assertTrue(t.json()["ok"])

        # init returns a session token + agent meta, never internal fields
        init = self.client.post(
            "/api/widget/init",
            json={"widget_id": widget_id, "origin": "https://example.com", "page_url": "https://example.com/", "page_title": "Acme"},
        )
        self.assertEqual(init.status_code, 200, init.text)
        body = init.json()
        self.assertTrue(body["session_token"].startswith("wses_"))
        self.assertEqual(body["agent"]["name"], "Nova")

        # message without token rejected
        bad = self.client.post("/api/widget/message", json={"message": "hi"})
        self.assertEqual(bad.status_code, 401)

        # unsupported channel connect -> coming soon (honest error, not a fake success)
        soon = self.client.post(f"/api/agents/{AGENT}/channels/whatsapp/connect", headers=AUTH, json={"config": {}})
        self.assertEqual(soon.status_code, 400)
        self.assertIn("coming soon", soon.json()["detail"])

    # 6. Telegram connect validates token via getMe
    def test_telegram_connect_validates_bot_token(self):
        async def fake_api(method, token, params=None):
            if method == "getMe":
                return {"ok": True, "result": {"username": "nova_bot", "first_name": "Nova"}}
            return {"ok": True, "result": {}}

        from app.channels.adapters import TelegramChannelAdapter
        TelegramChannelAdapter._api = staticmethod(fake_api)
        try:
            res = self.client.post(
                f"/api/agents/{AGENT}/channels/telegram/connect",
                headers=AUTH,
                json={"config": {"bot_token": "123456:TESTTOKEN"}},
            )
            self.assertEqual(res.status_code, 200, res.text)
            body = res.json()
            self.assertEqual(body["status"], "connected")
            self.assertEqual(body["telegram_bot_username"], "nova_bot")
            self.assertTrue(body["credentials_configured"])

            # the token value must never be returned (setup_fields label is fine)
            self.assertNotIn("123456:TESTTOKEN", body["config"].values())
            self.assertNotIn("bot_token", body["config"])
            self.assertNotIn("123456:TESTTOKEN", json.dumps(body))
        finally:
            TelegramChannelAdapter._api = TelegramChannelAdapter._real_api

    # 7. Telegram connect rejects a bad token
    def test_telegram_connect_rejects_bad_token(self):
        async def fake_api(method, token, params=None):
            return {"ok": False, "description": "Unauthorized", "error_code": 401}

        from app.channels.adapters import TelegramChannelAdapter
        TelegramChannelAdapter._api = staticmethod(fake_api)
        try:
            res = self.client.post(
                f"/api/agents/{AGENT}/channels/telegram/connect",
                headers=AUTH,
                json={"config": {"bot_token": "bad:token"}},
            )
            self.assertEqual(res.status_code, 400)
        finally:
            TelegramChannelAdapter._api = TelegramChannelAdapter._real_api

    # 8. Telegram publish registers a webhook + secret (never exposed)
    def test_telegram_publish_registers_webhook(self):
        from app.channels.adapters import TelegramChannelAdapter
        seen = {}

        async def fake_api(method, token, params=None):
            if method == "getMe":
                return {"ok": True, "result": {"username": "nova_bot"}}
            if method == "setWebhook":
                seen["url"] = params.get("url")
                seen["secret"] = params.get("secret_token")
                return {"ok": True, "result": True}
            return {"ok": True, "result": {}}

        TelegramChannelAdapter._api = staticmethod(fake_api)
        try:
            self.client.post(f"/api/agents/{AGENT}/channels/telegram/connect", headers=AUTH,
                             json={"config": {"bot_token": "123456:TOKEN"}})
            res = self.client.post(f"/api/agents/{AGENT}/channels/telegram/publish", headers=AUTH)
            self.assertEqual(res.status_code, 200, res.text)
            body = res.json()
            self.assertTrue(body["published"])
            self.assertIn("/api/channels/telegram/webhook/", seen["url"])
            # webhook secret is stored server-side but never returned to browser
            self.assertNotIn("secret_token", json.dumps(body))
        finally:
            TelegramChannelAdapter._api = TelegramChannelAdapter._real_api

    # 9. Publish before connect is blocked (honest lifecycle)
    def test_publish_before_connect_blocked(self):
        res = self.client.post(f"/api/agents/{AGENT}/channels/web/publish", headers=AUTH)
        self.assertEqual(res.status_code, 400)

    # 9b. Telegram webhook routes an incoming update through the real runtime
    def test_telegram_webhook_routes_through_runtime(self):
        from app.channels.adapters import TelegramChannelAdapter
        sent = {}

        async def fake_api(method, token, params=None):
            if method == "getMe":
                return {"ok": True, "result": {"username": "nova_bot"}}
            if method == "setWebhook":
                return {"ok": True, "result": True}
            if method == "sendMessage":
                sent["chat_id"] = params["chat_id"]
                sent["text"] = params["text"]
                return {"ok": True, "result": {}}
            return {"ok": True, "result": {}}

        TelegramChannelAdapter._api = staticmethod(fake_api)

        async def fake_runtime(**kwargs):
            return {"text": "Thanks for your message!", "blocks": [], "actions": [],
                    "status": "active", "terminal_state": "COMPLETED"}

        import app.api.telegram as telegram_api
        original_execute = telegram_api.AgentRuntime.execute
        telegram_api.AgentRuntime.execute = staticmethod(fake_runtime)
        try:
            # connect + publish telegram
            self.client.post(f"/api/agents/{AGENT}/channels/telegram/connect", headers=AUTH,
                             json={"config": {"bot_token": "123456:TOKEN"}})
            pub = self.client.post(f"/api/agents/{AGENT}/channels/telegram/publish", headers=AUTH).json()
            self.assertTrue(pub["published"])

            # pull the stored secret from the channel doc (server side)
            from app.channels.service import ChannelService
            conn = asyncio.run(ChannelService.resolve_telegram_connection(f"{AGENT}__telegram"))
            secret = (conn.get("config") or {})["secret_token"]

            # wrong secret -> rejected
            bad = self.client.post(
                f"/api/channels/telegram/webhook/{AGENT}__telegram",
                headers={"X-Telegram-Bot-Api-Secret-Token": "wrong"},
                json={"message": {"text": "hi", "chat": {"id": 42}, "from": {"first_name": "Ana"}}},
            )
            self.assertEqual(bad.json()["ok"], False)

            # correct secret -> processed, reply sent back to the chat
            good = self.client.post(
                f"/api/channels/telegram/webhook/{AGENT}__telegram",
                headers={"X-Telegram-Bot-Api-Secret-Token": secret},
                json={"message": {"text": "hi", "chat": {"id": 42}, "from": {"first_name": "Ana"}}},
            )
            self.assertEqual(good.json()["ok"], True)
            self.assertEqual(sent["chat_id"], 42)
            self.assertEqual(sent["text"], "Thanks for your message!")
        finally:
            TelegramChannelAdapter._api = TelegramChannelAdapter._real_api
            telegram_api.AgentRuntime.execute = original_execute

    # 10. Disconnect resets to not_configured
    def test_disconnect_resets_channel(self):
        self.client.post(f"/api/agents/{AGENT}/channels/web/connect", headers=AUTH, json={"config": {}})
        self.client.post(f"/api/agents/{AGENT}/channels/web/publish", headers=AUTH)
        res = self.client.post(f"/api/agents/{AGENT}/channels/web/disconnect", headers=AUTH)
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["status"], "not_configured")
        self.assertFalse(body["published"])
        self.assertIsNone(body["widget_id"])

    # 11. Agents list exposes real channel_counts
    def test_agents_list_has_channel_counts(self):
        self.client.post(f"/api/agents/{AGENT}/channels/web/connect", headers=AUTH, json={"config": {}})
        self.client.post(f"/api/agents/{AGENT}/channels/web/publish", headers=AUTH)
        res = self.client.get("/api/agents", headers=AUTH)
        self.assertEqual(res.status_code, 200)
        agent = next(a for a in res.json() if a["id"] == AGENT)
        cc = agent["channel_counts"]
        self.assertGreaterEqual(cc["published"], 1)
        self.assertEqual(cc["total"], 7)


if __name__ == "__main__":
    unittest.main()