use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    /// Bid structure - contains bidder identity and amount
    pub struct Bid {
        pub bidder: SerializedSolanaPublicKey,
        pub amount: u64,
    }

    /// Auction state - tracks highest and second-highest bids
    pub struct AuctionState {
        pub highest_bid: u64,
        pub highest_bidder: SerializedSolanaPublicKey,
        pub second_highest_bid: u64,
        pub bid_count: u8,
    }

    /// Final auction result - revealed to public
    pub struct AuctionResult {
        pub winner: SerializedSolanaPublicKey,
        pub payment_amount: u64,
    }

    /// Initialize auction state (all zeros)
    #[instruction]
    pub fn init_auction_state() -> Enc<Mxe, AuctionState> {
        let initial_state = AuctionState {
            highest_bid: 0,
            highest_bidder: SerializedSolanaPublicKey { lo: 0, hi: 0 },
            second_highest_bid: 0,
            bid_count: 0,
        };
        Mxe::get().from_arcis(initial_state)
    }

    /// Place bid - compares encrypted bid against encrypted state
    /// This runs inside MPC - values are decrypted ONLY within secure computation
    #[instruction]
    pub fn place_bid_v2(
        bid_ctxt: Enc<Shared, Bid>,
        state_ctxt: Enc<Mxe, AuctionState>,
    ) -> Enc<Mxe, AuctionState> {
        // Decrypt within MPC (never leaves secure environment)
        let bid = bid_ctxt.to_arcis();
        let mut state = state_ctxt.to_arcis();

        // Compare bid amount against current highest
        if bid.amount > state.highest_bid {
            // New highest bid - shift current highest to second place
            state.second_highest_bid = state.highest_bid;
            state.highest_bid = bid.amount;
            state.highest_bidder = bid.bidder;
        } else if bid.amount > state.second_highest_bid {
            // New second-highest bid
            state.second_highest_bid = bid.amount;
        }

        state.bid_count += 1;

        // Re-encrypt updated state
        state_ctxt.owner.from_arcis(state)
    }

    /// Determine winner (first-price) - winner pays their bid
    #[instruction]
    pub fn determine_winner_first_price(state_ctxt: Enc<Mxe, AuctionState>) -> AuctionResult {
        let state = state_ctxt.to_arcis();

        AuctionResult {
            winner: state.highest_bidder,
            payment_amount: state.highest_bid,  // Pay your bid
        }
        .reveal()  // Only result is revealed, not individual bids
    }

    /// Determine winner (Vickrey) - winner pays second-highest bid
    /// This incentivizes truthful bidding
    #[instruction]
    pub fn determine_winner_vickrey(state_ctxt: Enc<Mxe, AuctionState>) -> AuctionResult {
        let state = state_ctxt.to_arcis();

        AuctionResult {
            winner: state.highest_bidder,
            payment_amount: state.second_highest_bid,  // Pay second-highest
        }
        .reveal()  // Only result is revealed, not individual bids
    }
}
