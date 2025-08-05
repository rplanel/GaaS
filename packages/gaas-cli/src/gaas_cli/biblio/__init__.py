import json
from typing import Annotated
import typer
from pathlib import Path
from dotenv import load_dotenv
from gaas_cli.biblio.crossref import gen_crossref_record
from gaas_cli.biblio.zotero import add_doi, gen_dois, gen_fetch

app = typer.Typer(no_args_is_help=True)

load_dotenv()  # take environment variables


@app.command()
def fetch(
    ctx: typer.Context,
    key: Annotated[
        str,
        typer.Option(
            envvar="GAAS_ZOTERO_API_KEY",
            help="Zotero API key used for authenticating requests to the Zotero service.",
        ),
    ],
    library_id: Annotated[
        str, typer.Argument(help="Zotero library ID.", envvar="GAAS_ZOTERO_LIBRARY_ID")
    ],
    collection_id: Annotated[
        str,
        typer.Argument(
            help="Zotero collection ID from which items should be retrieved",
            envvar="GAAS_ZOTERO_COLLECTION_ID",
        ),
    ],
    batch_size: int = 100,
    lib_type: str = "user",
    output: Path = Path("biblio"),
):
    """
    Fetch items from a specified Zotero library collection and save them to a JSON file.

    Args:
        key (str):
            Zotero API key used for authenticating requests to the Zotero service.
        library_id (str):
            Zotero library ID to query (e.g., the user or group library ID).
        collection_id (str):
            Zotero collection ID from which items should be retrieved.
        batch_size (int, optional):
            Number of items to fetch in each batch. Defaults to 100.
        lib_type (str, optional):
            Type of Zotero library, either "user" or "group". Defaults to "group".
        output (Path, optional):
            Path to the output JSON file where the fetched items are saved. Defaults to "articles.json".

    Returns:
        None
    """
    # verbose = ctx.obj.get("verbose", False)
    # if verbose:
    verbose = ctx.obj["verbose"]
    params = {
        "key": key,
        "library_id": library_id,
        "collection_id": collection_id,
        "batch_size": batch_size,
        "lib_type": lib_type,
        "verbose": verbose,
    }
    items = list(gen_fetch(**params))
    if not output.exists():
        output.mkdir(parents=True, exist_ok=True)
    for item in items:
        item.pop("data", None)
        json_object = json.dumps(item, indent=2)
        filename = item["id"].replace("/", "-")
        with open(output / f"{filename}.json", "w") as outfile:
            outfile.write(json_object)


@app.command()
def fetch_crossref():
    """
    Fetches a record from CrossRef using the provided DOI.

    Args:
        doi (str): The DOI of the item to fetch.

    Returns:
        dict: The JSON response from CrossRef.
    """
    doi = "10.1016/0042-6822(73)90432-7"
    record = gen_crossref_record(doi)
    print(json.dumps(record, indent=2))
    return record


@app.command()
def sync_dois(
    ctx: typer.Context,
    key: Annotated[
        str,
        typer.Option(
            envvar="GAAS_ZOTERO_API_KEY",
            help="Zotero API key used for authenticating requests to the Zotero service.",
        ),
    ],
    library_id: Annotated[
        str, typer.Argument(help="Zotero library ID.", envvar="GAAS_ZOTERO_LIBRARY_ID")
    ],
    collection_id: Annotated[
        str,
        typer.Argument(
            help="Zotero collection ID from which items should be retrieved",
            envvar="GAAS_ZOTERO_COLLECTION_ID",
        ),
    ],
    content_dir: Annotated[
        str,
        typer.Option(
            help="Directory containing content files.",
        ),
    ],
    batch_size: int = 100,
    lib_type: str = "user",
):
    """
    Fetches DOIs from the specified content directory.
    """

    verbose = ctx.obj["verbose"]

    add_doi(key, library_id, collection_id, lib_type, batch_size, content_dir, verbose)


@app.command()
def dois_in_zotero(
    ctx: typer.Context,
    key: Annotated[
        str,
        typer.Option(
            envvar="GAAS_ZOTERO_API_KEY",
            help="Zotero API key used for authenticating requests to the Zotero service.",
        ),
    ],
    library_id: Annotated[
        str, typer.Argument(help="Zotero library ID.", envvar="GAAS_ZOTERO_LIBRARY_ID")
    ],
    collection_id: Annotated[
        str,
        typer.Argument(
            help="Zotero collection ID from which items should be retrieved",
            envvar="GAAS_ZOTERO_COLLECTION_ID",
        ),
    ],
    batch_size: int = 100,
    lib_type: str = "user",
):
    verbose = ctx.obj["verbose"]

    collection_items = gen_fetch(
        key, library_id, collection_id, lib_type, batch_size, verbose
    )
    dois_in_collection = gen_dois(collection_items, verbose)
    dois = list(dois_in_collection)
    print(dois)
