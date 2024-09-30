#!/usr/bin/env bash

detach=false
no_test=false
no_build=false
dev=false
custom_test=false
test=

usage() {
  if [[ -n $1 ]]; then
    echo "$*"
    echo
  fi
  cat <<EOF

usage: $0 [OPTIONS]

Bootstrap a validator to start a network.
Gossip host must be set to a private or public IP to communicate beyond localhost.

OPTIONS:
  --detach             - Once bootstrap and tests are complete, keep the validator running
  --no-test            - Skip running tests and only bootstrap the validator
  --no-build           - Skip building the rust and typescript code
  --dev                - Symlink to local dependencies
  --test               - If provided, run tests specified as a comma-separated list (e.g., "phoenix,drift,demo")

EOF
  exit 1
}

positional_args=()
while [[ -n $1 ]]; do
  if [[ ${1:0:1} = - ]]; then
    if [[ $1 = --detach ]]; then
      detach=true
      shift 1
    elif [[ $1 = --no-test ]]; then
      no_test=true
      shift 1
    elif [[ $1 = --no-build ]]; then
      no_build=true
      shift 1
    elif [[ $1 = --dev ]]; then
      dev=true
      shift 1
    elif [[ $1 = --test ]]; then
      custom_test=true
      test=$2
      shift 2
    elif [[ $1 = -h ]]; then
      usage "$@"
    else
      echo "Unknown argument: $1"
      exit 1
    fi
  else
    positional_args+=("$1")
    shift
  fi
done

kill_process() {
    # Killing local validator if currently running
    solana_pid=$(pgrep -f solana)
    # # if no value is returned do nothing, else pkill -f solana
    if [[ -n $solana_pid ]]; then
        pkill -f solana
    fi
    # exit shell script with success status
    exit 0
}
trap kill_process SIGINT

# helper function to silence background processes
bkg() { "$@" >/dev/null & }

if [[ $no_build == false ]]; then
  chmod +x ./build.sh

  if [[ $dev == true ]]; then
    ./build.sh --dev || exit 1
  else
    ./build.sh || exit 1
  fi
fi

# Killing local validator if currently running
solana_pid=$(pgrep -f solana)
if [[ -n $solana_pid ]]; then
  pkill -f solana
fi

# suppress output form anchor localnet
# start anchor localnet in background
bkg anchor localnet || kill_process
# sleep to warmup validator
sleep 10

# run bootstrap.sh
chmod +x ./bootstrap.sh
./bootstrap.sh || exit 1

if [[ $no_test == false ]]; then
  export ANCHOR_WALLET="$HOME/.config/solana/cosmic_lab_inc.json"
  rpc_url=$(solana config get | grep "RPC URL" | cut -d " " -f 3)
  export ANCHOR_PROVIDER_URL=$rpc_url

  if [[ $custom_test == false ]]; then
    yarn anchor-tests || kill_process
  else
    echo "Running test: $test"
    if [[ $test == "phoenix" ]]; then
      yarn test:phoenix || kill_process
    elif [[ $test == "drift" ]]; then
      yarn test:drift || kill_process
    elif [[ $test == "demo" ]]; then
      yarn test:drift || kill_process
      yarn test:demo || kill_process
    else
      echo "Unknown test: $test"
      kill_process
    fi
  fi
fi

# if detach is false, run kill_process
if [[ $detach == false ]]; then
    kill_process
fi
if [[ $detach == true ]]; then
    echo "Validator still running..."
fi

while true; do
    sleep 1
done