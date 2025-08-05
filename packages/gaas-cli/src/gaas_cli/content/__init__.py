import typer

import gaas_cli.content.collection as collection


app = typer.Typer()
app.add_typer(collection.app, name="collection", help="Manage nuxt content collections.")
