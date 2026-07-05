// swift-tools-version:5.8
import PackageDescription

let package = Package(
    name: "devscreen-capture",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "devscreen-capture",
            path: "Sources/devscreen-capture"
        )
    ]
)
