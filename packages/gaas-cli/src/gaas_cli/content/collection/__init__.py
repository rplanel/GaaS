import typer
from typing import Annotated
from pathlib import Path
import csv
import json

app = typer.Typer(no_args_is_help=True)


@app.command()
def create_from_csv(
    ctx: typer.Context,
    file: Path,
    name: Annotated[
        str, typer.Option(help="Name of the collection")
    ] = "new-collection",
    id: Annotated[
        str, typer.Option(help="Name of the column id that will be used as filename")
    ] = "id",
    output: Path = Path("content/collection"),
):
    """
    Create a nuxt content collection from a CSV file.
    This command reads a CSV file and for each row, create a json file in the content collection.
    """

    with open(file, newline="") as csvfile:  # Ensure the file is opened correctly
        csv_reader = csv.DictReader(csvfile)
        # next(reader, None)  # skip the headers
        output_dir = output / name
        if not output_dir.exists():
            output_dir.mkdir(parents=True, exist_ok=True)
        for row in csv_reader:
            # Create a filename based on the name field in the row
            filename = f"{row.get(id)}.json"
            file_path = output_dir / filename
            # Write the row data to a JSON file
            with open(file_path, "w") as json_file:
                json_file.write(json.dumps(row))
