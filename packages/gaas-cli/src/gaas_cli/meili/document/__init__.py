from typing import Annotated
import requests
import typer
import json
from rich import print
from rich.console import Console

console = Console()

app = typer.Typer(no_args_is_help=True)


@app.command()
def add(
    ctx: typer.Context,
    index_name: str,
    documents: Annotated[
        str, typer.Argument(help="Path to JSON file containing documents to add.")
    ],
):
    """Add documents to a specific MeiliSearch index."""
    client = ctx.obj["client"]
    with open(documents, "r") as f:
        docs = json.load(f)
        response = client.index(index_name).add_documents(docs)
        print(f"Add documents response: {response}")


@app.command()
def add_movies(ctx: typer.Context):
    client = ctx.obj["client"]
    index_name = "movies"
    client.index(index_name).update_settings(
        {
            "filterableAttributes": ["genre"],
            "sortableAttributes": ["release_date"],
        }
    )
    client.index(index_name).update_pagination_settings({"maxTotalHits": 40000})
    url = "https://raw.githubusercontent.com/meilisearch/datasets/main/datasets/movies/movies.json"
    console.print(f"Downloading sample movies data from {url}...")
    response = requests.get(url)
    movies = response.json()
    console.print(f"Adding {len(movies)} movie documents to index '{index_name}'...")
    tasks = client.index(index_name).add_documents_in_batches(movies)
    for task in tasks:
        console.print(task)
