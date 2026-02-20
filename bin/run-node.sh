#!/bin/bash
# Dynamic Node.js launcher that works with nvm
source "${HOME}/.nvm/nvm.sh"
exec node "$@"
