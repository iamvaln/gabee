# Gabee classification-digest cron sidecar.
# A small alpine container that wakes once a day at CRON_DIGEST_HOUR_UTC and
# POSTs the internal classification-digest endpoint on the web service. The
# endpoint itself does all the work (iterate notification prefs, send mail,
# bump last_sent_at) — this sidecar is just a deterministic scheduler.
FROM alpine:3.20

RUN apk add --no-cache bash ca-certificates tzdata coreutils curl jq \
 && update-ca-certificates

COPY bin/ /usr/local/bin/
RUN chmod +x /usr/local/bin/*

ENV TZ=UTC

ENTRYPOINT ["/usr/local/bin/entrypoint"]
CMD ["loop"]
