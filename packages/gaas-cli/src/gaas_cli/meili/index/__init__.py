from typing import Annotated
import typer
from rich.pretty import pprint
from rich.console import Console
from rich.table import Table


console = Console()
app = typer.Typer(no_args_is_help=True)


# @app.callback()
# def main(ctx: typer.Context, index: Annotated[str, typer.Option(help="Index name")]):
#     pass


@app.command()
def ls(ctx: typer.Context, settings: bool = False):
    """List all MeiliSearch indexes."""
    client = ctx.obj["client"]
    indexes = client.get_indexes()
    for index in indexes["results"]:
        console.rule(f"[bold] Index: {index.uid} [/bold]")
        table = Table(title="MeiliSearch Index: " + index.uid)
        table.add_column("Attribute", justify="right", style="cyan", no_wrap=True)
        table.add_column("Value", style="magenta")
        # pprint(json.load(index))
        table.add_row("UID", index.uid)
        table.add_row("Primary Key", str(index.primary_key))
        table.add_row("Created At", str(index.created_at))

        table.add_row("Updated At", str(index.updated_at))
        table.add_row(
            "Searchable Attributes",
            str(client.index(index.uid).get_searchable_attributes()),
        )
        table.add_row(
            "Sortable Attributes",
            str(client.index(index.uid).get_sortable_attributes()),
        )
        table.add_row(
            "Pagination Settings",
            str(client.index(index.uid).get_pagination_settings()),
        )
        table.add_section()
        statistics = client.index(index.uid).get_stats()
        pprint(statistics, expand_all=True)
        table.add_row("Number of Documents", str(statistics.number_of_documents))
        table.add_row("Is Indexing", str(statistics.is_indexing))
        if settings:
            table.add_row("Settings", str(client.index(index.uid).get_settings()))
        console.print(table)

    """
    List all MeiliSearch indexes.
    """
    print("Listing all MeiliSearch indexes...")

@app.command()
def rm(
    ctx: typer.Context, name: Annotated[str, typer.Argument(help="Index name")]
):
    """Delete a specific MeiliSearch index."""
    client = ctx.obj["client"]
    client.index(name).delete()
    print(f"Index '{name}' deleted.")


@app.command()
def get(ctx: typer.Context, name: Annotated[str, typer.Argument(help="Index name")]):
    """Get details of a specific MeiliSearch index."""
    client = ctx.obj["client"]
    index = client.get_index(name)
    print(f"Index details: {index}")