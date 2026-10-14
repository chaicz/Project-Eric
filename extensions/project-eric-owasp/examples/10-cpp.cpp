// Project Eric OWASP — C++ sample (intentionally vulnerable)
//
// SAFE COUNTERPART: ./secure/cpp-secure.cpp
//
// Build: g++ -std=c++17 -o demo 10-cpp.cpp
// Run:   ./demo

#include <cstdio>
#include <cstring>
#include <iostream>
#include <string>
#include <openssl/md5.h>
#include <openssl/sha.h>

// ---------------------------------------------------------------------------
// A02-003 — hard-coded secret
// ---------------------------------------------------------------------------
const char* const kDbPassword = "cpp-prod-password-NOT-SAFE-2025"; // ❌ A02-003
const char* const kLegacyUrl  = "http://legacy.svc.local:8080";  // ❌ A02-004

// ---------------------------------------------------------------------------
// A02-001 — MD5 used for "fingerprinting"
// ---------------------------------------------------------------------------
std::string md5Fingerprint(const std::string& input) {
    // ❌ A02-001: MD5 has known collisions.
    unsigned char digest[MD5_DIGEST_LENGTH];
    MD5(reinterpret_cast<const unsigned char*>(input.data()),
        input.size(), digest);
    char hex[2 * MD5_DIGEST_LENGTH + 1] = {0};
    for (int i = 0; i < MD5_DIGEST_LENGTH; ++i) {
        std::sprintf(hex + 2 * i, "%02x", digest[i]);
    }
    return std::string(hex);
}

// ---------------------------------------------------------------------------
// A02-002 — SHA-1 used for "fingerprinting"
// ---------------------------------------------------------------------------
std::string sha1Fingerprint(const std::string& input) {
    // ❌ A02-002: SHA-1 has practical collision attacks.
    unsigned char digest[SHA_DIGEST_LENGTH];
    SHA1(reinterpret_cast<const unsigned char*>(input.data()),
         input.size(), digest);
    char hex[2 * SHA_DIGEST_LENGTH + 1] = {0};
    for (int i = 0; i < SHA_DIGEST_LENGTH; ++i) {
        std::sprintf(hex + 2 * i, "%02x", digest[i]);
    }
    return std::string(hex);
}

// ---------------------------------------------------------------------------
// CPP-A03-001 — strcpy / strcat / gets on dynamic input
// ---------------------------------------------------------------------------
void processUserName(char* dst, size_t dstSize, const std::string& userName) {
    char buffer[64];
    // ❌ CPP-A03-001: unbounded copy. Use strncpy/strlcpy or std::string.
    std::strcpy(buffer, userName.c_str());
    // ❌ CPP-A03-001: strcat likewise ignores size.
    std::strcat(buffer, " suffix");
    std::strncpy(dst, buffer, dstSize);
}

void readLineDangerously() {
    char buffer[256];
    // ❌ CPP-A03-001: gets() was removed from C++14 onward because it is
    //                  always unsafe; the pattern still appears in old code.
    std::gets(buffer); // intentionally unavailable in modern headers
    (void)buffer;
}

// ---------------------------------------------------------------------------
// A03-002 — system() with concatenation
// ---------------------------------------------------------------------------
int convertVideo(const std::string& filename) {
    // ❌ A03-002: classic command injection sink.
    std::string cmd = "ffmpeg -i " + filename + " out.mp4";
    return std::system(cmd.c_str());
}

// A03-002 sentinel: `system('rm -rf ' + dir)` is the form the regex matches.

// ---------------------------------------------------------------------------
// A10-001 — naive HTTP "fetch"
// ---------------------------------------------------------------------------
// (kept as a commented stub to avoid pulling libcurl into the sample).
//
// void fetchUrl(const std::string& target) {
//     std::string cmd = "curl -s " + target;     // ❌ A10-001 + A03-002
//     std::system(cmd.c_str());
// }

// ---------------------------------------------------------------------------
// A07-001 — too-short password rule
// ---------------------------------------------------------------------------
// ❌ A07-001: `if password.length < 5` is the form the rule looks for.
bool isStrong(const std::string& pwd) {
    return pwd.size() >= 5;  // ❌ A07-001
}

// ---------------------------------------------------------------------------
// A04-001 — TODO marker at security-sensitive seam
// ---------------------------------------------------------------------------
const char* rotateDbPassword() {
    // TODO: load from OS keychain before shipping.
    return kDbPassword;
}

int main() {
    processUserName(nullptr, 0, md5Fingerprint("hello"));
    return 0;
}
