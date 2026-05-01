class ParadigmMemory < Formula
  desc "Local-first navigable memory MCP for coding agents"
  homepage "https://github.com/infinition/paradigm-memory"
  license "Apache-2.0"

  depends_on "node@22"

  on_macos do
    on_arm do
      url "https://github.com/infinition/paradigm-memory/releases/download/v0.1.1/paradigm-memory-cli-v0.1.1-macos-arm64.tar.gz"
      sha256 "REPLACE_WITH_GITHUB_RELEASE_SHA256"
    end
    on_intel do
      url "https://github.com/infinition/paradigm-memory/releases/download/v0.1.1/paradigm-memory-cli-v0.1.1-macos-x64.tar.gz"
      sha256 "REPLACE_WITH_GITHUB_RELEASE_SHA256"
    end
  end

  def install
    libexec.install Dir["*"]
    bin.install_symlink libexec/"bin/paradigm"
    bin.install_symlink libexec/"bin/paradigm-memory-mcp"
    bin.install_symlink libexec/"bin/paradigm-memory-http"
  end

  test do
    assert_match "paradigm", shell_output("#{bin}/paradigm --help")
  end
end
