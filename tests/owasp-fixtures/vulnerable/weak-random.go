package main

import (
	"fmt"
	"math/rand"
)

func resetPasswordToken() string {
	// A02: math/rand is a predictable PRNG — the token is guessable.
	// crypto/rand must be used for security values.
	buf := make([]byte, 16)
	rand.Read(buf)
	return fmt.Sprintf("%x", buf)
}

func main() {
	fmt.Println(resetPasswordToken())
}
