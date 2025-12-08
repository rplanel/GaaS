import typer
from typing import Annotated
from pathlib import Path
import pandas as pd
import gaas_cli.content.collection as collection


app = typer.Typer()
app.add_typer(
    collection.app, name="collection", help="Manage nuxt content collections."
)


@app.command()
def to_parquet(
    ctx: typer.Context,
    input_file: Annotated[Path, typer.Argument(help="Path to the input CSV file")],
    output_file: Annotated[
        Path | None,
        typer.Option("--output", "-o", help="Path to the output Parquet file"),
    ] = None,
):
    """
    Convert csv files to parquet format for faster processing.
    """

    if output_file is None:
        output_file = input_file.with_suffix(".parquet")

    if not input_file.exists():
        typer.echo(f"Error: Input file '{input_file}' does not exist.", err=True)
        raise typer.Exit(code=1)

    try:
        df = pd.read_csv(input_file)
        df.to_parquet(output_file, index=False)
        typer.echo(f"Successfully converted '{input_file}' to '{output_file}'")
    except Exception as e:
        typer.echo(f"Error converting file: {e}", err=True)
        raise typer.Exit(code=1)
