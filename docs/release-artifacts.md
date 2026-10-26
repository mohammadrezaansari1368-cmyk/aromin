# Release artifacts

`tools/package_release.py` writes archives into local `releases/`. Never commit
archives or checksum sidecars; publish them as GitHub Release assets. Markdown
release notes and `releases/.gitignore` remain trackable.

From the repository root, replace `X.Y.Z` with the release version. The packager
creates a ZIP SHA256 sidecar; generate one for the TGZ before uploading:

```sh
(cd releases && sha256sum aromin-deploy-X.Y.Z.tgz > aromin-deploy-X.Y.Z.tgz.sha256)
gh release create vX.Y.Z releases/aromin-deploy-X.Y.Z.tgz releases/*.sha256 --draft
```

Check that the wildcard selects only the intended release's checksums. Upload
the matching ZIP too if distributing its checksum. Review the draft before
publishing it.

After downloading an archive and its sidecar into the same directory, verify:

```sh
sha256sum -c aromin-deploy-X.Y.Z.tgz.sha256
sha256sum -c aromin-deploy-X.Y.Z.zip.sha256
```

Each distributed archive must report `OK`. Untracking existing archives only
removes them from future snapshots: history is not rewritten, and old blobs
remain in Git history.
