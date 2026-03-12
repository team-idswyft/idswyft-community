from setuptools import setup, find_packages
import pathlib

here = pathlib.Path(__file__).parent.resolve()

# Get the long description from the README file
long_description = (here / "README.md").read_text(encoding="utf-8")

setup(
    name="idswyft",
    version="3.0.0",
    author="Idswyft Team",
    author_email="support@idswyft.app",
    description="Official Python SDK for the Idswyft identity verification platform",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/doobee46/idswyft",
    project_urls={
        "Bug Reports": "https://github.com/doobee46/idswyft/issues",
        "Documentation": "https://idswyft.app/doc",
        "Source": "https://github.com/doobee46/idswyft/tree/main/sdks/python",
    },
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Topic :: Software Development :: Libraries :: Python Modules",
        "Topic :: Security",
        "Topic :: Internet :: WWW/HTTP :: Dynamic Content",
    ],
    keywords="idswyft identity verification kyc document authentication api sdk",
    packages=find_packages(),
    python_requires=">=3.8",
    install_requires=[
        "requests>=2.28.0",
        "typing-extensions>=4.0.0;python_version<'3.10'",
    ],
    extras_require={
        "dev": [
            "pytest>=7.0.0",
            "pytest-cov>=4.0.0",
            "black>=22.0.0",
            "flake8>=5.0.0",
            "mypy>=0.991",
            "twine>=4.0.0",
        ],
        "test": [
            "pytest>=7.0.0",
            "pytest-cov>=4.0.0",
            "responses>=0.21.0",
        ],
    },
    package_data={
        "idswyft": ["py.typed"],
    },
    include_package_data=True,
)