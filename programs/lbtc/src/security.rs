#[cfg(not(feature = "no-entrypoint"))]
use solana_security_txt::security_txt;

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
    name: "Lombard Finance",
    project_url: "https://www.lombard.finance",
    contacts: "email:legal@lombard.finance",
    policy: "https://immunefi.com/bug-bounty/lombard-finance/information"
}