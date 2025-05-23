import typer
from rich import print
from typing_extensions import Annotated

# from dotenv import dotenv_values
import gaas_cli.biblio as biblio

# config = dotenv_values()  # take environment variables

# print(config)


app = typer.Typer(no_args_is_help=True)
app.add_typer(
    biblio.app,
    name="biblio",
    help="Manage bibliographic data.",
)

# @app.command()
# def biblio(name: Annotated[str, typer.Argument()]):
#     print(f"Hello from gaas-cli to biblio! Your name is {name}.")


@app.command()
def hello(name: Annotated[str, typer.Argument()]):
    print(f"Hello from gaas-cli! Your name is {name}.")


@app.callback()
def main(ctx: typer.Context, verbose: bool = False):
    """
    Manage data used for the wiki.
    """
    print(f"About to execute command: {ctx.invoked_subcommand}")
    if verbose:
        print("Verbose mode is enabled.")
    ctx.obj = {"verbose": verbose}


if __name__ == "__main__":
    app()
