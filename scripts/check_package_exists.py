#!/usr/bin/env python3
"""Check if a package version exists in GitLab Package Registry."""

import argparse
import json
import sys
import urllib.request
from urllib.error import HTTPError


def check_package_exists(
    api_url: str,
    project_id: str,
    package_name: str,
    package_version: str,
    job_token: str,
) -> bool:
    """
    Check if a package version exists in the GitLab Package Registry.

    Returns True if the package exists, False otherwise.
    """
    url = (
        f"{api_url}/projects/{project_id}/packages"
        f"?package_type=pypi"
        f"&package_name={package_name}"
        f"&package_version={package_version}"
    )
    req = urllib.request.Request(url, headers={"JOB-TOKEN": job_token})

    try:
        with urllib.request.urlopen(req) as response:
            packages = json.loads(response.read().decode())
            if packages:
                print(
                    f"Version {package_version} already exists in the registry. "
                    "Skipping publish."
                )
                return True
            else:
                print(f"Version {package_version} not found. Proceeding with publish...")
                return False
    except HTTPError as e:
        print(f"Error checking package: {e}")
        return False  # Proceed with publish on error


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Check if a package version exists in GitLab Package Registry"
    )
    parser.add_argument("--api-url", required=True, help="GitLab API URL")
    parser.add_argument("--project-id", required=True, help="GitLab project ID")
    parser.add_argument("--package-name", required=True, help="Package name")
    parser.add_argument("--package-version", required=True, help="Package version")
    parser.add_argument("--job-token", required=True, help="GitLab CI job token")

    args = parser.parse_args()

    exists = check_package_exists(
        api_url=args.api_url,
        project_id=args.project_id,
        package_name=args.package_name,
        package_version=args.package_version,
        job_token=args.job_token,
    )

    # Exit with code 100 if package exists (to signal skip publish)
    # Exit with code 0 if package doesn't exist (proceed with publish)
    sys.exit(100 if exists else 0)


if __name__ == "__main__":
    main()
