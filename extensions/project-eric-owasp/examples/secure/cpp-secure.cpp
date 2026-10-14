// Project Eric OWASP — C++ SECURE counterpart.

#include <array>
#include <cstdint>
#include <cstring>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include <openssl/sha.h>

namespace secure {

inline std::string sha256Hex(const std::string& data) {
    unsigned char digest[SHA256_DIGEST_LENGTH];
    SHA256(reinterpret_cast<const unsigned char*>(data.data()),
           data.size(), digest);
    std::ostringstream oss;
    oss << std::hex << std::setfill('0');
    for (unsigned char c : digest) oss << std::setw(2) << static_cast<int>(c);
    return oss.str();
}

inline void copyBounded(char* dst, size_t dstSize, const std::string& src) {
    if (dstSize == 0) return;
    size_t n = std::min(src.size(), dstSize - 1);
    std::memcpy(dst, src.data(), n);
    dst[n] = '\0';
}

inline std::string fingerprint(const std::string& blob) {
    return sha256Hex(blob);
}

inline bool isStrong(const std::string& pwd) {
    return pwd.size() >= 12;
}

} // namespace secure

int main() {
    std::cout << secure::fingerprint("hello world") << std::endl;
    return 0;
}
