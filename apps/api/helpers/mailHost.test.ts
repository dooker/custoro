import { describe, expect, it } from "vitest";
import { checkCompanyMailHost, isPrivateAddress, mailPorts } from "./mailHost";

const resolvesTo =
    (...addresses: string[]) =>
    async () =>
        addresses.map((address) => ({ address }));

describe("isPrivateAddress", () => {
    it.each([
        "127.0.0.1",
        "10.1.2.3",
        "172.16.0.5",
        "172.31.255.255",
        "192.168.1.1",
        "169.254.169.254",
        "100.64.0.1",
        "0.0.0.0",
        "::1",
        "fd12::1",
        "fe80::1",
        "::ffff:127.0.0.1",
        "::ffff:10.0.0.1",
        // the same addresses written another way (Copilot review of PR 40)
        "0:0:0:0:0:0:0:1",
        "0000:0000:0000:0000:0000:0000:0000:0001",
        "::0:1",
        "::ffff:7f00:1",
        "0:0:0:0:0:ffff:7f00:1",
        "::ffff:0a00:0005",
        "::127.0.0.1",
        "64:ff9b::a00:1",
        "2002:7f00:1::1",
        "FE80::1",
        "FD00::1",
        "0::",
        "not an address"
    ])("refuses %s", (address) => {
        expect(isPrivateAddress(address)).toBe(true);
    });

    it.each([
        "8.8.8.8",
        "172.32.0.1",
        "185.7.252.10",
        "2a00:1450:4001::1",
        "2A00:1450:4001:0:0:0:0:1",
        "::ffff:8.8.8.8",
        "::ffff:808:808",
        "64:ff9b::808:808"
    ])(
        "allows %s",
        (address) => {
            expect(isPrivateAddress(address)).toBe(false);
        }
    );
});

describe("checkCompanyMailHost", () => {
    it("allows a public mail server on a mail port, and gives the address it checked", async () => {
        for (const port of mailPorts) {
            expect(
                await checkCompanyMailHost(
                    "smtp.example.test",
                    port,
                    false,
                    resolvesTo("185.7.252.10")
                )
            ).toEqual({ ok: true, address: "185.7.252.10" });
        }
    });

    it.each([
        ["the database's port", "smtp.example.test", 3306, resolvesTo("185.7.252.10")],
        ["a name for the server itself", "localhost", 587, resolvesTo("127.0.0.1")],
        ["a name that resolves inside", "smtp.example.test", 587, resolvesTo("10.0.0.7")],
        [
            "a name with one inside address among public ones",
            "smtp.example.test",
            587,
            resolvesTo("185.7.252.10", "192.168.0.2")
        ],
        ["an inside address typed in", "169.254.169.254", 587, resolvesTo()],
        [
            "a name that does not resolve",
            "nowhere.invalid",
            587,
            async () => Promise.reject(new Error("ENOTFOUND"))
        ],
        ["no host", "", 587, resolvesTo("185.7.252.10")]
    ])("refuses %s", async (_case, host, port, lookup) => {
        expect(await checkCompanyMailHost(host, port, false, lookup)).toEqual({
            ok: false,
            message: "mailHostNotAllowed"
        });
    });

    it("allows anything with MAIL_ALLOW_PRIVATE_HOSTS (the dev stack's catcher)", async () => {
        expect(await checkCompanyMailHost("mail", 1025, true, resolvesTo("172.18.0.4"))).toEqual({
            ok: true,
            address: "mail"
        });
    });
});
