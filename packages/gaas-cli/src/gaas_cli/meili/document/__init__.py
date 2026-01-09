from enum import Enum
from pathlib import Path
from typing import Annotated, Optional

from gaas_cli.meili.document.loader import (
    load_csv_documents,
    load_json_documents,
    load_parquet_documents,
)
import requests
import typer
from rich.console import Console

console = Console(stderr=True)

app = typer.Typer(no_args_is_help=True)


class DocumentFormat(str, Enum):
    json = "json"
    csv = "csv"
    parquet = "parquet"


@app.command()
def add(
    ctx: typer.Context,
    index_name: str,
    primary_key: Annotated[
        Optional[str],
        typer.Option(
            help="Primary key for the documents. If not provided, uses 'id' as the default."
        ),
    ] = "id",
    format: Annotated[
        DocumentFormat,
        typer.Option(help="Format of the documents: json, parquet, or csv"),
    ] = DocumentFormat.json,
    documents: Annotated[
        Optional[Path],
        typer.Argument(
            help="Path to file containing documents to add. "
            "Use '-' or omit to read from stdin."
        ),
    ] = None,
):
    """Add documents to a specific MeiliSearch index."""
    client = ctx.obj["client"]

    # Read documents from file or stdin
    if format == DocumentFormat.json:
        docs = load_json_documents(documents)
    elif format == DocumentFormat.csv:
        docs = load_csv_documents(documents)
    elif format == DocumentFormat.parquet:
        docs = load_parquet_documents(documents)
    else:
        console.print(f"[red]Unsupported document format: {format}[/red]")
        raise typer.Exit(code=1)

    response = client.index(index_name).add_documents(docs, primary_key)
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
            "sortableAttributes": ["release_date", "title", "genres"],
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
                "details.rating",
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


@app.command()
def add_world_cities(ctx: typer.Context):
    client = ctx.obj["client"]
    index_name = "world_cities"
    client.index(index_name).update_settings(
        {
            "filterableAttributes": [
                "country",
                "country_code",
                "timezone",
                "population",
            ],
            "sortableAttributes": [
                "name",
                "population",
                "timezone",
                "country",
                "country_code",
            ],
        }
    )
    client.index(index_name).update_pagination_settings({"maxTotalHits": 40000})

    client.index(index_name).update_faceting_settings(
        {
            "sortFacetValuesBy": {
                "*": "count",
            }
        }
    )

    url = "https://raw.githubusercontent.com/meilisearch/datasets/main/datasets/world_cities/world-cities.json"
    console.print(f"Downloading sample world cities data from {url}...")
    response = requests.get(url)
    cities = response.json()

    console.print(
        f"Adding {len(cities)} world city documents to index '{index_name}'..."
    )
    tasks = client.index(index_name).add_documents(cities)
    for task in tasks:
        console.print(task)
