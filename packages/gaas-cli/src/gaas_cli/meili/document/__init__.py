import json
import sys
from pathlib import Path
from typing import Annotated, Optional

import requests
import typer
from rich.console import Console

console = Console(stderr=True)

app = typer.Typer(no_args_is_help=True)


@app.command()
def add(
    ctx: typer.Context,
    index_name: str,
    documents: Annotated[
        Optional[Path],
        typer.Argument(
            help="Path to JSON file containing documents to add. "
            "Use '-' or omit to read from stdin."
        ),
    ] = None,
):
    """Add documents to a specific MeiliSearch index."""
    client = ctx.obj["client"]

    # Read documents from file or stdin
    if documents is None or str(documents) == "-":
        docs = json.load(sys.stdin)
    else:
        with open(documents, "r") as f:
            docs = json.load(f)

    response = client.index(index_name).add_documents(docs)
    console.print(f"Add documents response: {response}")


@app.command()
def add_movies(ctx: typer.Context):
    client = ctx.obj["client"]
    index_name = "movies"
    client.index(index_name).update_settings(
        {
            "filterableAttributes": [
                "genres",
            ],
            "sortableAttributes": ["release_date"],
        }
    )
    client.index(index_name).update_pagination_settings({"maxTotalHits": 40000})
    url = "https://raw.githubusercontent.com/meilisearch/datasets/main/datasets/movies/movies.json"
    console.print(f"Downloading sample movies data from {url}...")
    response = requests.get(url)
    movies = response.json()
    console.print(f"Adding {len(movies)} movie documents to index '{index_name}'...")
    tasks = client.index(index_name).add_documents(movies)
    for task in tasks:
        console.print(task)


@app.command()
def add_books(ctx: typer.Context):
    client = ctx.obj["client"]
    index_name = "books"
    client.index(index_name).update_settings(
        {
            "filterableAttributes": [
                "author",
                "language",
                "publisher",
                "cover",
                "details.pages",
                "details.rating"
            ],
            "sortableAttributes": ["title", "author", "isbn13"],
        }
    )
    client.index(index_name).update_pagination_settings({"maxTotalHits": 40000})
    url = "https://raw.githubusercontent.com/meilisearch/datasets/main/datasets/books/books.json"
    console.print(f"Downloading sample books data from {url}...")
    response = requests.get(url)
    books = response.json()
    # sanitized_books = []
    for book in books:
        if "author" in book and isinstance(book["author"], str):
            book["author"] = book["author"].split("/")
            book["details"]["pages"] = int(book["details"]["pages"])
            book["details"]["rating"] = float(book["details"]["rating"])
    console.print(f"Adding {len(books)} book documents to index '{index_name}'...")
    tasks = client.index(index_name).add_documents(books)
    for task in tasks:
        console.print(task)
