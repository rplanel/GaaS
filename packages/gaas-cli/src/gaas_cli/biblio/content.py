from pathlib import Path
from rich.console import Console
import frontmatter
import re

console = Console()


def gen_content_dois(content_dir: str, verbose: bool = False):
    content_path = Path(content_dir)
    if verbose:
        console.rule(
            f"[bold blue]Check for references in content: {content_path}", style="blue"
        )

    for file in content_path.rglob("*"):
        if file.suffix == ".md":
            if verbose:
                console.print(f"[green]{file.name}", style="blue")

            with open(file) as f:
                _, content = frontmatter.parse(f.read())
                # handle content
                group = re.findall(r":ref{dois=(?:\"|\')(.*?)(?:\"|\')}", content)
                for g in group:
                    splitted = [doi.lower().strip() for doi in re.split(",", g)]
                    for item in splitted:
                        if type(item) is str:
                            item = item.strip()
                            yield item
