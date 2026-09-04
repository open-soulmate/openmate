from acp.schema import AgentMessageChunk, TextContentBlock, SessionNotification

# Check how to construct properly
tc = TextContentBlock(text="hello")
print("TextContentBlock:", tc)
print("TextContentBlock dump:", tc.model_dump(by_alias=True, exclude_none=True))

amc = AgentMessageChunk(content=tc, session_update="agent_message_chunk")
print("AgentMessageChunk:", amc)
print("AMC dump:", amc.model_dump(by_alias=True, exclude_none=True))

# Check SessionNotification
sn = SessionNotification(session_id="test-123", update=amc)
print("SessionNotification:", sn)
print("SN dump:", sn.model_dump(by_alias=True, exclude_none=True))

# Check what update_agent_message does
import acp
import inspect
print("\n--- update_agent_message ---")
print(inspect.getsource(acp.update_agent_message))
print("\n--- update_agent_message_text ---")
print(inspect.getsource(acp.update_agent_message_text))
