import unittest
import asyncio
import sys
import os
from unittest import mock
from fastapi import HTTPException

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.database.firestore import firestore_client
from app.services.agent_service import AgentService
from app.api.master_agent import (
    _calculate_master_agent_status,
    _get_workspace_provider_config,
    get_master_agent_config,
    update_master_agent_config,
    test_master_agent_provider,
    enable_master_agent,
    disable_master_agent,
    MasterAgentConfigRequest,
    TestProviderRequest
)
from app.ai.tools.platform_tools import PlatformToolExecutor
from app.ai.runtime.agent_runtime import AgentRuntime

class TestZhyraMasterAgentArchitecture(unittest.TestCase):
    def setUp(self):
        self.workspace_id = "ws_master_test_suite"
        self.zhyra_id = f"agt_zhyra_{self.workspace_id[:5]}"
        
        # Clean up any leftover test documents
        try:
            firestore_client.collection("agents").document(self.zhyra_id).delete()
            firestore_client.collection("settings").document(f"ai_providers_{self.workspace_id}").delete()
        except Exception:
            pass

    def tearDown(self):
        try:
            firestore_client.collection("agents").document(self.zhyra_id).delete()
            firestore_client.collection("settings").document(f"ai_providers_{self.workspace_id}").delete()
        except Exception:
            pass

    def test_1_master_agent_provisioning_and_initial_status(self):
        """1. Workspace created -> Master Agent automatically exists and shows SETUP_REQUIRED."""
        zhyra = asyncio.run(AgentService.provision_zhyra_master_agent(self.workspace_id))
        self.assertEqual(zhyra["name"], "Zhyra")
        self.assertEqual(zhyra["agent_type"], "master")
        self.assertIsNone(zhyra.get("provider_id"))

        # Check status calculation
        status_info = asyncio.run(_calculate_master_agent_status(self.workspace_id, zhyra))
        self.assertEqual(status_info["status"], "SETUP_REQUIRED")
        self.assertFalse(status_info["is_enabled"])
        self.assertEqual(status_info["provider_status"], "Not configured")

    def test_2_zhyra_name_reservation_and_creation_rules(self):
        """2. Disallow manual creation of master agents or standard agents named Zhyra."""
        # Reject master type
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(AgentService.create_agent(self.workspace_id, {"name": "Fake Agent", "purpose": "Test", "agent_type": "master"}))
        self.assertEqual(ctx.exception.status_code, 400)

        # Reject name Zhyra
        with self.assertRaises(HTTPException) as ctx2:
            asyncio.run(AgentService.create_agent(self.workspace_id, {"name": "Zhyra", "purpose": "Fake Zhyra", "agent_type": "specialist"}))
        self.assertEqual(ctx2.exception.status_code, 400)
        self.assertIn("reserved", ctx2.exception.detail)

    def test_3_delete_protection_for_master_agent(self):
        """3. Master agent cannot be deleted, but normal agents can."""
        zhyra = asyncio.run(AgentService.provision_zhyra_master_agent(self.workspace_id))
        
        # Disallow delete master
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(AgentService.delete_agent(self.workspace_id, zhyra["id"]))
        self.assertEqual(ctx.exception.status_code, 400)

        # Normal agent creation and deletion
        normal = asyncio.run(AgentService.create_agent(self.workspace_id, {"name": "Tara Test", "purpose": "Support", "agent_type": "specialist"}))
        self.assertIsNotNone(normal["id"])
        asyncio.run(AgentService.delete_agent(self.workspace_id, normal["id"]))

    def test_4_provider_assignment_and_model_validation(self):
        """4. Assign provider/model to Zhyra and validate."""
        from app.utils.encryption import encrypt_value
        zhyra = asyncio.run(AgentService.provision_zhyra_master_agent(self.workspace_id))
        
        # Set mock provider key in settings
        settings_ref = firestore_client.collection("settings").document(f"ai_providers_{self.workspace_id}")
        settings_ref.set({"gemini": {"api_key": encrypt_value("mock_key_123")}})

        # Update Zhyra config with provider & model
        req = MasterAgentConfigRequest(provider_id="gemini", model="gemini-3.5-flash")
        res = asyncio.run(update_master_agent_config(req, workspace_id=self.workspace_id))
        
        self.assertEqual(res["provider_id"], "gemini")
        self.assertEqual(res["model"], "gemini-3.5-flash")
        self.assertEqual(res["status"], "READY")  # Configured but not yet explicitly enabled

    def test_5_real_provider_test(self):
        """5. Provider test endpoint executes provider validation."""
        from app.utils.encryption import encrypt_value
        asyncio.run(AgentService.provision_zhyra_master_agent(self.workspace_id))
        settings_ref = firestore_client.collection("settings").document(f"ai_providers_{self.workspace_id}")
        settings_ref.set({"gemini": {"api_key": encrypt_value("mock_key_123")}})

        test_req = TestProviderRequest(provider_id="gemini", model="gemini-3.5-flash")
        res = asyncio.run(test_master_agent_provider(test_req, workspace_id=self.workspace_id))
        self.assertEqual(res["status"], "success")

    def test_6_enablement_and_disablement(self):
        """6. Enable Zhyra becomes ENABLED; Disable Zhyra becomes READY."""
        from app.utils.encryption import encrypt_value
        asyncio.run(AgentService.provision_zhyra_master_agent(self.workspace_id))
        settings_ref = firestore_client.collection("settings").document(f"ai_providers_{self.workspace_id}")
        settings_ref.set({"gemini": {"api_key": encrypt_value("mock_key_123")}})

        req = MasterAgentConfigRequest(provider_id="gemini", model="gemini-3.5-flash")
        asyncio.run(update_master_agent_config(req, workspace_id=self.workspace_id))

        # Enable
        enabled_res = asyncio.run(enable_master_agent(workspace_id=self.workspace_id))
        self.assertEqual(enabled_res["status"], "ENABLED")
        self.assertTrue(enabled_res["is_enabled"])

        # Disable
        disabled_res = asyncio.run(disable_master_agent(workspace_id=self.workspace_id))
        self.assertEqual(disabled_res["status"], "READY")
        self.assertFalse(disabled_res["is_enabled"])

    def test_7_provider_disconnect_safety(self):
        """7. If assigned provider is disconnected, status becomes ERROR."""
        from app.utils.encryption import encrypt_value
        asyncio.run(AgentService.provision_zhyra_master_agent(self.workspace_id))
        
        # Configure Gemini and enable Zhyra
        settings_ref = firestore_client.collection("settings").document(f"ai_providers_{self.workspace_id}")
        settings_ref.set({"gemini": {"api_key": encrypt_value("mock_key_123")}})

        req = MasterAgentConfigRequest(provider_id="gemini", model="gemini-3.5-flash")
        asyncio.run(update_master_agent_config(req, workspace_id=self.workspace_id))
        asyncio.run(enable_master_agent(workspace_id=self.workspace_id))

        # Disconnect provider (remove API key)
        settings_ref.set({"gemini": {"api_key": ""}})

        # Status should now report ERROR (Provider Disconnected)
        cfg = asyncio.run(get_master_agent_config(workspace_id=self.workspace_id))
        self.assertEqual(cfg["status"], "ERROR")
        err_msg = cfg["status_checks"]["error_reason"].lower()
        self.assertTrue("disconnected" in err_msg or "not configured" in err_msg)

    def test_8_master_agent_not_ready_runtime_enforcement(self):
        """8. Master agent runtime refuses execution with MASTER_AGENT_NOT_READY if disabled or unconfigured."""
        zhyra = asyncio.run(AgentService.provision_zhyra_master_agent(self.workspace_id))
        
        # Execute without enabling Zhyra
        res = asyncio.run(AgentRuntime.execute(
            workspace_id=self.workspace_id,
            agent_id=zhyra["id"],
            query="Hello Zhyra",
            history=[]
        ))

        self.assertEqual(res["terminal_state"], "FAILED")
        self.assertEqual(res["error_code"], "MASTER_AGENT_NOT_READY")
        self.assertIn("not ready to execute", res["text"])

    def test_9_agent_registry_and_delegation(self):
        """9. Agent registry returns active standard agents and Zhyra delegates to real agent."""
        zhyra = asyncio.run(AgentService.provision_zhyra_master_agent(self.workspace_id))
        
        # Create standard specialist agent Tara
        tara = asyncio.run(AgentService.create_agent(self.workspace_id, {
            "name": "Tara Unit Test",
            "purpose": "Customer Refund Specialist",
            "agent_type": "specialist"
        }))

        try:
            available = asyncio.run(AgentService.get_available_agents(self.workspace_id))
            self.assertTrue(any(a["name"] == "Tara Unit Test" for a in available))
            self.assertFalse(any(a["name"] == "Zhyra" for a in available))

            # Test delegation platform tool
            with mock.patch("app.ai.runtime.agent_runtime.AgentRuntime.execute") as mock_exec:
                mock_exec.return_value = {"text": "Refund of $50 processed successfully by Tara.", "terminal_state": "COMPLETED"}
                del_res = asyncio.run(PlatformToolExecutor.execute(
                    self.workspace_id,
                    "delegate_to_agent",
                    {"agent_id": tara["id"], "task": "Process refund for order #1234"}
                ))
                self.assertTrue(del_res["success"])
                self.assertEqual(del_res["delegated_agent"], "Tara Unit Test")
                self.assertIn("Refund of $50", del_res["result"])
        finally:
            asyncio.run(AgentService.delete_agent(self.workspace_id, tara["id"]))

if __name__ == "__main__":
    unittest.main()
