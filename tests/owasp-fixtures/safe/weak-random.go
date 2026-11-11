package main

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
)

func resetPasswordToken() (string, error) {
	// A02: crypto/rand is a CSPRNG — the token is unpredictable.
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func main() {
	token, err := resetPasswordToken()
	if err != nil {
		panic(err)
	}
	fmt.Println(token)
}
