#!/bin/bash
/opt/homebrew/bin/psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -At -c "$1"
