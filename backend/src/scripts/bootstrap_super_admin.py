import argparse
import sys

from ..database import session
from ..services.rbac import assign_super_admin


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Assign the protected super-admin role.")
    parser.add_argument("--email", required=True)
    args = parser.parse_args(argv)

    try:
        with session() as db:
            assign_super_admin(db, args.email)
    except Exception:
        print("Super administrator bootstrap failed.", file=sys.stderr)
        return 1

    print("Super administrator assigned successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
