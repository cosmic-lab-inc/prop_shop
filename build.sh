home() {
    cd "$(git rev-parse --show-toplevel)" || exit 1
}

home

dev=false

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
  --dev             - Symlink to local dependencies

EOF
  exit 1
}

positional_args=()
while [[ -n $1 ]]; do
  if [[ ${1:0:1} = - ]]; then
    if [[ $1 = --dev ]]; then
      dev=true
      shift 1
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

if [[ $(uname -m) == "arm64" ]]; then
    echo "Running on Apple Silicon"
    rustup override set 1.75.0-x86_64-apple-darwin
else
    echo "Not running on Apple Silicon"
    rustup override set 1.75.0
fi

agave-install init 1.18.8
solana-install init 1.18.8

CXX=/opt/homebrew/bin/c++-14 cargo build || exit 1

cargo fmt || exit 1

pnpm i || exit 1

if [[ $dev == true ]]; then
  pnpm link:all || exit 1
fi

pnpm dep:all || exit 1

pnpm build || exit 1

pnpm prettify || exit 1