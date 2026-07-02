# aesthete-inference — Make targets honored by scripts/aesthete-gate.sh (worker tier).
#
#   make test    run the pytest suite (bootstraps .venv on first run; golden
#                tests auto-skip until `make export` has produced models/)
#   make export  download + int8-quantize both nomic v1.5 models into models/
#   make serve   run the worker locally on :8000 (needs INFERENCE_TOKEN)
#   make golden  regenerate tests/fixtures/golden_vectors.json (after a model bump)
#   make bench   rough p50 latency loop (1 short text, 1 image)
#
# Python 3.12 is used when `uv` is available (matches the Docker base image);
# otherwise falls back to system python3.

SHELL := /bin/bash
VENV  := .venv
PY    := $(VENV)/bin/python

.PHONY: test serve export golden bench clean

$(VENV)/.deps: requirements.txt requirements-dev.txt
	@if command -v uv >/dev/null 2>&1; then \
		[ -x "$(PY)" ] || uv venv --python 3.12 $(VENV); \
		uv pip install --python $(PY) -q -r requirements.txt -r requirements-dev.txt; \
	else \
		[ -x "$(PY)" ] || python3 -m venv $(VENV); \
		$(PY) -m pip install -q --upgrade pip; \
		$(PY) -m pip install -q -r requirements.txt -r requirements-dev.txt; \
	fi
	@touch $(VENV)/.deps

test: $(VENV)/.deps
	$(PY) -m pytest -q

export: $(VENV)/.deps
	@if command -v uv >/dev/null 2>&1; then \
		uv pip install --python $(PY) -q -r requirements-export.txt; \
	else \
		$(PY) -m pip install -q -r requirements-export.txt; \
	fi
	$(PY) scripts/export_models.py

serve: $(VENV)/.deps
	$(PY) -m uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000

golden: $(VENV)/.deps
	$(PY) scripts/make_golden.py

bench: $(VENV)/.deps
	$(PY) scripts/bench.py

clean:
	rm -rf $(VENV) .pytest_cache **/__pycache__
