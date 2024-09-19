home() {
    cd $(git rev-parse --show-toplevel)
}

home

cargo test --package bootstrap --test phoenix bootstrap_markets -- --exact --nocapture