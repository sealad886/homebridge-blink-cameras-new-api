# ADR-004: Own media sessions through confirmed retirement

Status: accepted implementation direction; behavioral verification pending.

PREPARE admits a unique generation before allocating ports. That generation owns
late allocations, preparation expiry, START continuations, callbacks, children,
private transports, polling and cleanup. Cancellation fences continuations without
forgetting late remote-command completion obligations. Duplicate IDs remain rejected
while retirement retains local resources. Child closure, rather than a kill request,
permits port release. Cleanup timeout retains reservations until closure.

IMMIS media reaches the owned encoder through its private stdin pipe. Replacement
encoders receive fresh pipes after predecessor closure. Readiness and keepalive polling
run sequentially; keepalive is scheduled after request completion.

ADR-003 remains authoritative for account command coordination, response deadlines,
ambiguous POST handling, snapshot coalescing and confirmed device state.
