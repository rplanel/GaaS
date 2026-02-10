from typing import Annotated
import typer
from rich.console import Console
from pathlib import Path

console = Console(stderr=True)
app = typer.Typer(no_args_is_help=True)


@app.command()
def env_var(
    ctx: typer.Context,
    nuxt_prefix: Annotated[
        bool, typer.Option("--nuxt-prefix", help="Add NUXT_ prefix to env vars")
    ] = False,
    output: Annotated[
        Path,
        typer.Option(
            exists=False,
            file_okay=True,
            writable=True,
        ),
    ] = Path("build.env"),
):
    client = ctx.obj["client"]
    keys = client.get_keys()
    nuxt_prefix_str = "NUXT_" if nuxt_prefix else ""
    api_key = [res.key for res in keys.results if res.name == "Default Search API Key"]
    if len(api_key) == 1:
        with open(output, "a") as outfile:
            outfile.write(f"{nuxt_prefix_str}MEILI_HOST={ctx.obj['host']}\n")
            outfile.write(f"{nuxt_prefix_str}MEILI_API_KEY={api_key[0]}\n")