class ClientError(Exception):
    """Base error for CultForge SDK client failures."""


class RemoteUnavailable(ClientError):
    """Remote CultForge APIs are unreachable or not yet initialized."""
