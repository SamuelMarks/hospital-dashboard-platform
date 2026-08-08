import re
import os
import glob


def process_html(content):
  # Attributes
  # We must ensure no [ before the attribute, meaning it's not a property binding like [placeholder]="..."
  # We also avoid adding if there's already i18n-attr
  for attr in ["placeholder", "aria-label", "title", "matTooltip"]:
    pattern = r"(?<!i18n-)(?<!\[)\b(" + attr + r')="([^"]*[a-zA-Z][^"]*)"'
    content = re.sub(pattern, r'i18n-\1 \1="\2"', content)

  # Let's tokenize into text and tags
  tokens = re.split(r'(</?[a-zA-Z0-9\-]+(?:>|\s[^>]*?(?:"[^"]*"|\'[^\']*\'|[^>]*?)*>))', content)

  tags_to_localize = {
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "span",
    "button",
    "a",
    "label",
    "mat-label",
    "mat-card-title",
    "mat-card-subtitle",
    "mat-error",
    "mat-chip",
    "th",
    "td",
    "mat-menu-item",
    "mat-option",
    "mat-step",
    "mat-panel-title",
    "mat-panel-description",
    "mat-hint",
    "mat-checkbox",
    "mat-radio-button",
    "mat-slide-toggle",
    "mat-tab",
  }

  out = []
  stack = []

  for t in tokens:
    if t.startswith("</"):
      match = re.match(r"</([a-zA-Z0-9\-]+)>", t)
      if match:
        tag_name = match.group(1)
        for i in range(len(stack) - 1, -1, -1):
          if stack[i][0] == tag_name:
            stack = stack[:i]
            break
      out.append(t)
    elif t.startswith("<"):
      match = re.match(r'<([a-zA-Z0-9\-]+)(\s*(?:[^>]*?(?:"[^"]*"|\'[^\']*\'|[^>]*?)*)?)>', t, re.DOTALL)
      if match:
        tag_name = match.group(1)
        attrs = match.group(2)

        # Check for existing i18n or i18n-* on the element
        # Actually, only i18n (without dash) makes it a translatable section for its content!
        # i18n-placeholder is fine, it doesn't make the content translatable.
        has_i18n_content = bool(re.search(r"\bi18n(?:\s*=|[\s>])", attrs + ">"))

        parent_has_i18n = any(s_i18n for _, s_i18n in stack)

        should_add = False
        if tag_name in tags_to_localize and not has_i18n_content and not parent_has_i18n:
          should_add = True
          has_i18n_content = True

        if should_add:
          if attrs.endswith("/"):
            t = f"<{tag_name} i18n{attrs[:-1]}/>"
          else:
            t = f"<{tag_name} i18n{attrs}>"

        if not attrs.endswith("/") and not (attrs.endswith(">") and t.endswith("/>")):
          stack.append((tag_name, has_i18n_content))
      out.append(t)
    else:
      out.append(t)

  return "".join(out)


def main():
  target_dir = "/Users/samuel/repos/new_research/stanford/pulse-query/pulse-query-ng-web/src/app"
  files = glob.glob(target_dir + "/**/*.html", recursive=True)
  for f in files:
    if f.endswith("login.component.html"):
      continue
    with open(f, "r") as file:
      content = file.read()

    new_content = process_html(content)

    if new_content != content:
      with open(f, "w") as file:
        file.write(new_content)
      print(f"Updated: {f}")


if __name__ == "__main__":
  main()
