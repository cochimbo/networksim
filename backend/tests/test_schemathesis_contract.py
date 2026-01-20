import os
import schemathesis

# Load generated OpenAPI JSON
HERE = os.path.dirname(__file__)
SCHEMA_PATH = os.path.abspath(os.path.join(HERE, os.pardir, "openapi.json"))

schema = schemathesis.from_path(SCHEMA_PATH)


@schema.parametrize()
def test_contract(case):
    # Default base URL taken from OpenAPI `servers` entry; override by env var if needed
    base_url = os.environ.get("API_BASE_URL", "http://localhost:8080")
    response = case.call(base_url=base_url)
    case.validate_response(response)
