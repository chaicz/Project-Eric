package main

import (
	"fmt"
	"os/exec"
)

func pingHost(host string) (string, error) {
	// A03: user input reaches the shell through a command string.
	out, err := exec.Command("sh", "-c", "ping -c 1 "+host).CombinedOutput()
	if err != nil {
		return "", err
	}
	return string(out), nil
}

func main() {
	fmt.Println(pingHost("example.com"))
}
