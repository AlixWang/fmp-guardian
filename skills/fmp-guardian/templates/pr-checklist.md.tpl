## FMP Checklist

- [ ] I checked `.fmp/mirror-matrix.yaml` for all modified P0 paths.
- [ ] I used detectors only to find affected mirrors; I did not add a competing source of truth.
- [ ] I updated semantic mirrors for behavior changes.
- [ ] I refreshed `.fmp/architecture-snapshot.json` after architecture-relevant changes.
- [ ] If docs did not change, `.fmp/impact.yaml` contains a current and specific waiver.
- [ ] I updated or considered evals/tests for changed high-risk behavior.
- [ ] I kept L3-Lite anchors short and current.
- [ ] I ran `fmp:check` or explained why not.
