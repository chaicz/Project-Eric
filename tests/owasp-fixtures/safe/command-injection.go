package main

import (
	"fmt"
	"os/exec"
)

func pingHost(host string) (string, error) {
	// Arguments are passed as a list, so no shell parsing is involved.
	out, err := exec.Command("ping", "-c", "1", host).CombinedOutput()
	if err != nil {
		return "", err
	}
	return string(out), nil
}

func main() {
	fmt.Println(pingHost("example.com"))
}
