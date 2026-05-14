from app.core.security import hash_password, verify_password


def main() -> None:
    password = "guardian-circle-smoke-check"
    wrong_password = "guardian-circle-wrong-password"

    hashed = hash_password(password)

    if not hashed or hashed == password:
        raise SystemExit(
            "Auth smoke check failed: password hashing did not return a usable bcrypt hash."
        )

    if not verify_password(password, hashed):
        raise SystemExit(
            "Auth smoke check failed: the correct password did not verify against its hash."
        )

    if verify_password(wrong_password, hashed):
        raise SystemExit(
            "Auth smoke check failed: an incorrect password unexpectedly verified."
        )

    print("Auth smoke check passed: password hashing and verification are working.")


if __name__ == "__main__":
    main()
