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
    ] = "MASTER_KEY",
):
    """Initialize MeiliSearch client."""
    client = meilisearch.Client(host, key)
    ctx.obj = {"client": client}
