import requests


def gen_crossref_record(dois):
    """
    Fetches a record from CrossRef using the provided DOI.

    Args:
        doi (str): The DOI of the item to fetch.

    Returns:
        dict: The JSON response from CrossRef.
    """

    for doi in dois:
        url = f"https://api.crossref.org/works/{doi}"
        headers = {"Accept": "application/json", "User-Agent": "gaas-cli/0.1"}
        response = requests.get(url, headers=headers)
        if response.status_code == 200:
            yield response.json()
        else:
            raise Exception(f"Error fetching data from CrossRef: {response.status_code}")
