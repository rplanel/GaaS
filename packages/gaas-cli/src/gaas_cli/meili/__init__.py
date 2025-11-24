from typing import Annotated
import typer
import meilisearch
from rich.console import Console
import requests
import gaas_cli.meili.index as index
import gaas_cli.meili.document as document
import gaas_cli.meili.task as task

app = typer.Typer(no_args_is_help=True)

app.add_typer(
    index.app,
    name="index",
    help="Manage MeiliSearch indexes.",
)

app.add_typer(
    document.app,
    name="document",
    help="Manage MeiliSearch documents.",
)

app.add_typer(
    task.app,
    name="task",
    help="Manage MeiliSearch tasks.",
)
console = Console()


@app.callback()
def main(
    ctx: typer.Context,
    host: Annotated[
        str, typer.Option(help="Meilisearch host", envvar="MEILI_HOST")
    ] = "http://localhost:7700",
    key: Annotated[
        str, typer.Option(help="Meilisearch API master key", envvar="MEILI_MASTER_KEY")
    ] = "masterKey",
):
    """Initialize MeiliSearch client."""
    client = meilisearch.Client(host, key)
    ctx.obj = {"client": client}


@app.command()
def get_index(ctx: typer.Context, name: str):
    """Get details of a specific MeiliSearch index."""
    client = ctx.obj["client"]
    index = client.get_index(name)
    print(f"Index details: {index}")


@app.command()
def add_movies_documents(ctx: typer.Context):
    """Add sample movie documents to a specific MeiliSearch index."""
    client = ctx.obj["client"]
    index_name = "movies"
    client.index(index_name).update_settings(
        {
            "filterableAttributes": ["genre"],
            "sortableAttributes": ["release_date"],
        }
    )
    client.index(index_name).update_pagination_settings({"maxTotalHits": 40000})
    # download sample movies data and
    # save it to a temporary JSON file
    url = "https://raw.githubusercontent.com/meilisearch/datasets/main/datasets/movies/movies.json"
    response = requests.get(url)
    movies = response.json()
    tasks = client.index("index_name").add_documents(movies)
    for task in tasks:
        console.print(task)
