from gaas_cli.biblio.content import gen_content_dois
from gaas_cli.biblio.crossref import gen_crossref_record
from pyzotero import zotero
from typing import Any, Generator
from rich import print
from rich.console import Console
from rich.columns import Columns

console = Console()


def gen_fetch(
    key: str,
    library_id: str,
    collection_id: str,
    lib_type: str = "user",
    batch_size: int = 100,
    verbose: bool = False,
) -> Generator[dict, None, None]:
    """
    Generator function to fetch items from a Zotero collection in batches.
    Args:
      zot: Zotero instance for making API calls.
      collection_id: ID of the Zotero collection to fetch items from.
      count_items: Total number of items in the collection.
      batch_size: Number of items to fetch in each batch.
    Yields:
      dict: A single item from the Zotero collection.
    """
    zot = zotero.Zotero(library_id, lib_type, key)
    collection: Any = zot.collection(collection_id)
    count_items = collection["meta"]["numItems"]
    starts = range(0, count_items, batch_size)
    for i in starts:
        collection_items: Any = zot.collection_items(
            collection_id,
            format="csljson",
            limit=batch_size,
            start=i,
            itemType="journalArticle || Preprint",
            sort="title",
        )
        items = collection_items["items"]
        if verbose:
            console.rule(
                f"[bold blue]References in Zotero collection: {collection['data']['name']}",
                style="blue",
            )
        for i, item in enumerate(items):
            if verbose:
                print(f"Item {i+1}: {item['title']}")
            yield item


def gen_dois(
    collection_items,
):
    """
    Generator function to extract DOIs from Zotero collection items.
    Args:
      collection_items: List of items in the Zotero collection.
    Yields:
      str: DOI of the item.
    """
    for item in collection_items:
        try:
            doi = item["DOI"]
            if doi:
                yield doi
        except KeyError:
            print(f"Item {item['title']} does not have a DOI.")


def dois_not_in_collection(
    dois_in_collection,
    dois_in_content,
    verbose: bool = False,
):
    """
    Compare DOIs in Zotero collection with DOIs in content.
    Args:
      dois_in_collection: List of DOIs in the Zotero collection.
      dois_in_content: List of DOIs in the content.
    Returns:
      set: DOIs that are in content but not in the Zotero collection.
    """
    # Convert the generator to a set
    dois_in_collection_set = set(dois_in_collection)
    dois_in_content_set = set(dois_in_content)
    missing_dois = dois_in_content_set - dois_in_collection_set
    if verbose:
        console.rule("[bold blue]DOIs in zotero collection", style="blue")
        columns = Columns(dois_in_collection_set, equal=True, expand=False)
        print(columns)
        console.rule("[bold blue]DOIs in content", style="blue")
        columns = Columns(dois_in_content_set, equal=True, expand=False)
        print(columns)
        console.rule("[bold blue]Missing DOIs", style="blue")
        columns = Columns(missing_dois, equal=True, expand=False)
        print(columns)
    return missing_dois


def add_doi(
    key: str,
    library_id: str,
    collection_id: str,
    lib_type: str = "user",
    batch_size: int = 100,
    content_dir: str = "content",
    verbose: bool = False,
):

    # get dois in zotero collection
    collection_items = gen_fetch(
        key, library_id, collection_id, lib_type, batch_size, verbose
    )
    dois_in_collection = gen_dois(collection_items)

    # get dois in content
    dois_in_content = gen_content_dois(content_dir, verbose)

    # get dois not in zotero collection
    missing_dois = dois_not_in_collection(dois_in_collection, dois_in_content, verbose)

    # get metedata from crossref to dois not in zotero collection

    records = gen_crossref_record(missing_dois)
    zotero_item = crossref_to_zotero(
        records, key, library_id, collection_id, lib_type, verbose
    )

    # add dois to zotero collection


def crossref_to_zotero(
    records,
    key: str,
    library_id: str,
    collection_id: str,
    lib_type: str = "user",
    verbose: bool = False,
):
    """
    Fetches DOIs from the specified content directory.
    """
    zot = zotero.Zotero(library_id, lib_type, key)
    zotero_items = []
    for record in records:
        message = record["message"]
        message_type = message["type"]
        if message_type == "posted-content":
            itemtype = "Preprint"
        elif message_type == "journal-article":
            itemtype = "journalArticle"
        else:
            raise NotImplementedError(f"type {message['type']} need to be implemented")
        zitem = zot.item_template(itemtype)
        zitem["title"] = message["title"][0]
        if "page" in message:
            zitem["pages"] = message["page"]
        if "abstract" in message:
            zitem["abstractNote"] = message["abstract"]

        if "container-title" in message and len(message["container-title"]) > 0:
            zitem["publicationTitle"] = message["container-title"][0]
        if (
            "short-container-title" in message
            and len(message["short-container-title"]) > 0
        ):
            zitem["journalAbbreviation"] = message["short-container-title"][0]
        zitem["creators"] = [
            {
                "creatorType": "author",
                "firstName": author["given"],
                "lastName": author["family"],
            }
            for author in message["author"]
        ]
        zitem["libraryCatalog"] = "DOI.org (Crossref)"
        if "ISSN" in message:
            zitem["ISSN"] = ", ".join(message["ISSN"])
        zitem["url"] = message["resource"]["primary"]["URL"]
        zitem["date"] = "/".join(
            [str(d) for d in message["published"]["date-parts"][0]]
        )
        for key in ["DOI", "volume", "issue", "language"]:
            if key in message:
                zitem[key] = message[key]

        zotero_items.append(zitem)

    # validate zotero items
    zot.check_items(zotero_items)

    response = zot.create_items(zotero_items)

    new_items = response["successful"]
    for new_item in new_items.values():
        if verbose:
            console.print(f"Added item: {new_item['data']['title']}")
        # add item to collection
        zot.addto_collection(collection_id, new_item)
