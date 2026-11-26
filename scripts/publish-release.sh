#!/usr/bin/env bash
set -euo pipefail

[[ "${GITHUB_REF_TYPE:-}" == tag ]]
tag="${GITHUB_REF_NAME:?Missing release tag}"
repository="${GITHUB_REPOSITORY:?Missing repository}"
artifact="${1:?Missing build artifact directory}"
publish_dir=$(mktemp -d)
trap 'rm -rf "$publish_dir"' EXIT

commit=$(git rev-parse HEAD)
remote_commit=$(gh api "repos/$repository/commits/$tag" --jq .sha)
if [[ "$remote_commit" != "$commit" ]]; then
  printf 'Release tag %s now points to %s, expected %s\n' "$tag" "$remote_commit" "$commit" >&2
  exit 1
fi

(cd "$artifact" && sha256sum --check sapientia.xpi.sha256)
is_beta=$(node -p 'require("./package.json").version.includes("-")')
release_name="Sapientia $tag"
release=$(gh release view "$tag" --repo "$repository" --json assets,isDraft,isPrerelease) || release=""
if [[ -z "$release" ]]; then
  flags=(--verify-tag --draft --title "$release_name" --generate-notes)
  if [[ "$is_beta" == true ]]; then flags+=(--prerelease); fi
  gh release create "$tag" --repo "$repository" "${flags[@]}"
  release=$(gh release view "$tag" --repo "$repository" --json assets,isDraft,isPrerelease)
fi
if [[ "$(jq -r .isPrerelease <<< "$release")" != "$is_beta" ]]; then
  printf 'Release %s has the wrong channel\n' "$tag" >&2
  exit 1
fi

asset_exists() {
  jq -e --arg name "$1" '.assets | any(.name == $name)' <<< "$release" >/dev/null
}

# Keep the original archive on a retry, even when a fresh build has another timestamp.
if asset_exists sapientia.xpi; then
  gh release download "$tag" --repo "$repository" --pattern sapientia.xpi --dir "$publish_dir"
else
  cp "$artifact/sapientia.xpi" "$publish_dir/sapientia.xpi"
fi
node scripts/release-assets.mjs "$publish_dir/sapientia.xpi" "$publish_dir"

if asset_exists sapientia.xpi.sha256; then
  gh release download "$tag" --repo "$repository" --pattern sapientia.xpi.sha256 --output "$publish_dir/existing.sha256"
  cmp "$publish_dir/existing.sha256" "$publish_dir/sapientia.xpi.sha256"
fi
if ! asset_exists sapientia.xpi; then
  gh release upload "$tag" --repo "$repository" "$publish_dir/sapientia.xpi"
fi
if ! asset_exists sapientia.xpi.sha256; then
  gh release upload "$tag" --repo "$repository" "$publish_dir/sapientia.xpi.sha256"
fi
if [[ "$(jq -r .isDraft <<< "$release")" == true ]]; then
  gh release edit "$tag" --repo "$repository" --draft=false
fi

updater=$(gh release view release --repo "$repository" --json assets) || updater=""
if [[ -z "$updater" ]]; then
  gh release create release --repo "$repository" --target "$commit" --prerelease --latest=false \
    --title "Sapientia Update Feed" --notes "Update manifests for Zotero. Download installers from the versioned releases."
  updater=$(gh release view release --repo "$repository" --json assets)
fi

feed=update.json
if [[ "$is_beta" == true ]]; then feed=update-beta.json; fi
if jq -e --arg name "$feed" '.assets | any(.name == $name)' <<< "$updater" >/dev/null; then
  current="$publish_dir/current-$feed"
  gh release download release --repo "$repository" --pattern "$feed" --output "$current"
  if cmp -s "$current" "$publish_dir/$feed"; then
    exit 0
  fi
  current_tag=$(jq -er '.addons[].updates[-1].update_link | split("/") | .[-2]' "$current")
  current_commit=$(git rev-parse --verify "refs/tags/$current_tag^{commit}")
  if ! git merge-base --is-ancestor "$current_commit" "$commit"; then
    printf 'Keeping %s at %s because it is not an ancestor of %s\n' "$feed" "$current_tag" "$tag"
    exit 0
  fi
fi
gh release upload release --repo "$repository" --clobber "$publish_dir/$feed"
