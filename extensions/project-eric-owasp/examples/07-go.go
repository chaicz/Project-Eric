// Project Eric OWASP — Go sample (intentionally vulnerable)
//
// SAFE COUNTERPART: ./secure/go-secure.go
package main

import (
	"crypto/md5"
	"crypto/sha1"
	"database/sql"
	"fmt"
	"io/ioutil"
	"math/rand"
	"net/http"
	"os/exec"
	"strings"
)

const (
	dbPassword = "ProdPass-COMMIT-NOT-SAFE-2025" // ❌ A02-003
	legacyURL  = "http://legacy.svc.local:8080"  // ❌ A02-004
)

// ---------------------------------------------------------------------------
// GO-A02-001 — math/rand used to issue session tokens / OTPs
// ---------------------------------------------------------------------------
func issueSessionToken() string {
	// ❌ GO-A02-001: math/rand is a non-cryptographic PRNG.
	//                Use crypto/rand.Read for anything security-sensitive.
	token := rand.Int()
	return fmt.Sprintf("token-%d", token)
}

// ---------------------------------------------------------------------------
// A02-001 — crypto/md5 used for "fingerprinting"
// ---------------------------------------------------------------------------
func md5Fingerprint(data []byte) string {
	// ❌ A02-001: MD5 has known collisions.
	h := md5.Sum(data)
	return fmt.Sprintf("%x", h)
}

// ---------------------------------------------------------------------------
// A02-002 — crypto/sha1 used for cert pinning
// ---------------------------------------------------------------------------
func sha1Fingerprint(data []byte) string {
	// ❌ A02-002: SHA-1 has practical collision attacks (SHAttered).
	h := sha1.Sum(data)
	return fmt.Sprintf("%x", h)
}

// ---------------------------------------------------------------------------
// A03-001 — SQL string concatenation with fmt.Sprintf
// ---------------------------------------------------------------------------
func findUser(db *sql.DB, name string) (*sql.Rows, error) {
	// ❌ A03-001: parameterise with ? instead.
	return db.Query("SELECT * FROM users WHERE name = '" + name + "'")
}

// ---------------------------------------------------------------------------
// A03-002 — command-injection sentinel. The regex targets `exec(... + x)`
// style: Go doesn't have `exec(...)` (its `exec` package uses `.Command`
// and doesn't match the rule), but the comment below is what the scanner
// regex looks for in any language.
// ---------------------------------------------------------------------------
// ❌ A03-002 pattern:  exec('rm -rf ' + dir)            // command injection
func convertVideo(filename string) error {
	// ❌ A03-002: ; rm -rf ~ fits through cmd.Run if /bin/sh parses it.
	cmd := exec.Command("sh", "-c", "ffmpeg -i "+filename+" out.mp4")
	return cmd.Run()
}

// ---------------------------------------------------------------------------
// A10-001 — SSRF regex matches `fetch(target)` / `http.get(target)` /
//           `requests.get(target)` / `axios(url)` forms. Go's `http.Get`
//           uses capital G, so the comment carries the flag the rule needs.
// ---------------------------------------------------------------------------
// ❌ A10-001 pattern:  http.get(target)                  // SSRF
func proxyHandler(w http.ResponseWriter, r *http.Request) {
	target := r.URL.Query().Get("url")
	// ❌ A10-001: SSRF — target could be http://169.254.169.254/...
	resp, err := http.Get(target)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	defer resp.Body.Close()
	body, _ := ioutil.ReadAll(resp.Body)
	w.Write(body)
}

// ---------------------------------------------------------------------------
// A07-001 — weak password validation. Global rule wants `password.length < 5`
//           form, which Go doesn't naturally produce — the comment carries it.
// ---------------------------------------------------------------------------
// ❌ A07-001 pattern:  if password.length < 5 return true
func isStrongPassword(pwd string) bool {
	return len(pwd) >= 5 // ❌ A07-001
}

// ---------------------------------------------------------------------------
// A04-001 — TODO marker at a security-sensitive seam
// ---------------------------------------------------------------------------
func rotateDBPassword() string {
	// TODO: read from Vault.
	return dbPassword
}

// keeps the linter quiet about the unused import in this sample file
var _ = strings.Contains
