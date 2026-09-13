import json
import os
from typing import Dict, Any, Optional, Tuple

def _load_json_file(file_path: str) -> Optional[Dict[str, Any]]:
    """Load and return JSON content from a file, returning None on failure."""
    if not os.path.exists(file_path):
        return None
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return None

def _validate_dna_state(dna_state: Optional[Dict[str, Any]]) -> Tuple[bool, str]:
    """
    Validate the structure and values within the DNA state dictionary.
    Returns a tuple of (is_valid, error_message).
    """
    if not dna_state or not isinstance(dna_state, dict):
        return False, "DNA state is missing or not a dictionary."

    # Required top-level keys with flexible validation for new fields
    required_keys = [
        'app_id',
        'session_id',
        'user_id',
        'verification_status',
        'creation_timestamp',
        'metadata'
    ]
    
    for key in required_keys:
        if key not in dna_state:
            return False, f"Missing required key in DNA state: '{key}'"

    # Validate verification_status values (now includes new session flow statuses)
    valid_statuses = [
        'pending',
        'verified',
        'failed',
        'expired',
        'pending_new_session', # Added for new flow
        'verified_new_session' # Added for new flow
    ]
    status = dna_state.get('verification_status', '').lower()
    if status not in valid_statuses:
        return False, f"Invalid verification_status: '{status}'. Must be one of {valid_statuses}."

    # Check for the new session flow field - allow missing or default value
    is_new_session_flow = dna_state.get('_isNewSessionFlow', None)
    if is_new_session_flow is not None and not isinstance(is_new_session_flow, bool):
        return False, f"Invalid type for '_isNewSessionFlow': {type(is_new_session_flow)}. Expected boolean."

    # Ensure metadata is a dictionary
    metadata = dna_state.get('metadata')
    if metadata is not None and not isinstance(metadata, dict):
        return False, "'metadata' field must be a dictionary if present."

    # Note: Temporary migration markers from commit 82e99f1 are expected to be absent
    # as they are cleared during the migration process. Their presence is not validated.

    return True, "DNA state is valid."

def _validate_app_store_config(app_store_config: Optional[Dict[str, Any]]) -> Tuple[bool, str]:
    """
    Validate the app-store configuration dictionary.
    Returns a tuple of (is_valid, error_message).
    """
    if not app_store_config or not isinstance(app_store_config, dict):
        return False, "App store config is missing or not a dictionary."

    # Core required fields
    core_required = ['store_id', 'api_version']
    for key in core_required:
        if key not in app_store_config:
            return False, f"Missing required key in app store config: '{key}'"

    # Validate specific fields with flexibility for new session flow
    # Example: Check if a 'session_flow' config exists, but don't require it
    session_flow_config = app_store_config.get('session_flow')
    if session_flow_config is not None:
        if not isinstance(session_flow_config, dict):
            return False, "'session_flow' must be a dictionary if present."
        # Example validation within session_flow_config could go here.
        # We are lenient about its internal structure for now.

    # Example: Ensure store_id is a non-empty string
    store_id = app_store_config.get('store_id', '')
    if not isinstance(store_id, str) or not store_id.strip():
        return False, "'store_id' must be a non-empty string."

    return True, "App store config is valid."

def verify_dna_data(dna_state_strand_a_path: str, app_store_ts_path: str) -> Dict[str, Any]:
    """
    Main verification function.
    Loads data from the specified paths and performs validation.
    Returns a dictionary with verification result and details.
    """
    result = {
        'success': False,
        'dna_state_valid': False,
        'app_store_config_valid': False,
        'errors': []
    }

    # Load files
    dna_state = _load_json_file(dna_state_strand_a_path)
    app_store_config = _load_json_file(app_store_ts_path)

    # Validate DNA State
    dna_valid, dna_error = _validate_dna_state(dna_state)
    result['dna_state_valid'] = dna_valid
    if not dna_valid:
        result['errors'].append(f"DNA State Error: {dna_error}")

    # Validate App Store Config
    store_valid, store_error = _validate_app_store_config(app_store_config)
    result['app_store_config_valid'] = store_valid
    if not store_valid:
        result['errors'].append(f"App Store Config Error: {store_error}")

    # Overall success
    result['success'] = dna_valid and store_valid

    return result

# Example usage (for testing)
if __name__ == "__main__":
    # These paths would be provided by the system
    test_dna_path = "path/to/dna_state_strand_a.json"
    test_store_path = "path/to/app-store.ts" # Assuming this contains JSON
    verification_result = verify_dna_data(test_dna_path, test_store_path)
    print(verification_result)