import typer

# from rich import print_json
from rich.pretty import pprint

app = typer.Typer(no_args_is_help=True)


@app.command()
def get(ctx: typer.Context, task_id: int):
    """Get the status of a specific MeiliSearch task."""
    client = ctx.obj["client"]
    task = client.get_task(task_id)
    print("Task details")
    pprint(task, expand_all=True)
    # print_json(json.dumps(task, indent=2))
