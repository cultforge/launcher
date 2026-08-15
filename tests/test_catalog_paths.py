"""Sidecar catalog template path matching — regression guard for templated admin routes."""

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from client import _catalog_path_matches  # noqa: E402


class CatalogPathMatchTests(unittest.TestCase):
    def test_exact_match(self):
        self.assertTrue(
            _catalog_path_matches("/v1/admin/mail", "/v1/admin/mail"),
        )

    def test_user_sessions_template(self):
        self.assertTrue(
            _catalog_path_matches(
                "/v1/admin/users/{id}/sessions",
                "/v1/admin/users/abc-123/sessions",
            ),
        )

    def test_session_revoke_template(self):
        self.assertTrue(
            _catalog_path_matches(
                "/v1/admin/sessions/{session_id}/revoke",
                "/v1/admin/sessions/42/revoke",
            ),
        )

    def test_rejects_wrong_segment_count(self):
        self.assertFalse(
            _catalog_path_matches(
                "/v1/admin/users/{id}/sessions",
                "/v1/admin/users/abc-123",
            ),
        )

    def test_rejects_literal_mismatch(self):
        self.assertFalse(
            _catalog_path_matches(
                "/v1/admin/users/{id}/sessions",
                "/v1/admin/guilds/abc-123/sessions",
            ),
        )


if __name__ == "__main__":
    unittest.main()
