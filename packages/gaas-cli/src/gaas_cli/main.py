from typing import Optional

import typer
from rich.console import Console

# from dotenv import dotenv_values
import gaas_cli.biblio as biblio
import gaas_cli.content as content
import gaas_cli.meili as meili

# Get version from _version.py (generated at build time by uv-dynamic-versioning)
try:
    from gaas_cli._version import version as __version__
except ImportError:
    __version__ = "0.0.0.dev0"  # fallback for development

# config = dotenv_values()  # take environment variables

console = Console(stderr=True)

# print(config)


app = typer.Typer(no_args_is_help=True)
app.add_typer(
    biblio.app,
    name="biblio",
    help="Manage bibliographic data.",
)

app.add_typer(
    content.app,
    name="content",
    help="Manage Nuxt content (Wiki).",
)

app.add_typer(
    meili.app,
    name="meili",
    help="Manage MeiliSearch instances and indexes.",
)

# @app.command()
# def biblio(name: Annotated[str, typer.Argument()]):
#     print(f"Hello from gaas-cli to biblio! Your name is {name}.")


def version_callback(value: bool):
    if value:
        console.print(f"gaas-cli version: {__version__}")
        raise typer.Exit()


@app.callback()
def main(
    ctx: typer.Context,
    verbose: bool = False,
    version: Optional[bool] = typer.Option(
        None,
        "--version",
        "-v",
        callback=version_callback,
        is_eager=True,
        help="Show version and exit.",
    ),
):
    """
    Tool kit to manage gaas related tasks.
    """
    console.print(f"About to execute command: {ctx.invoked_subcommand}")
    if verbose:
        console.print("Verbose mode is enabled.")
    ctx.obj = {"verbose": verbose}


if __name__ == "__main__":
    app()
