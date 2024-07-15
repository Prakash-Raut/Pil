#!/usr/bin/env/ node

import chalk from "chalk";
import { Command } from "commander";
import { diffLines } from "diff";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const program = new Command();

class Groot {
	constructor(repoPath = ".") {
		this.repoPath = path.join(repoPath, ".groot");
		this.objectsPath = path.join(this.repoPath, "objects"); // .groot/objects
		this.headPath = path.join(this.repoPath, "HEAD"); // .groot/HEAD
		this.indexPath = path.join(this.repoPath, "index"); // .groot/index
		this.init();
	}

	/* 
        Initialised the empty groot repository
    */
	async init() {
		await fs.mkdir(this.objectsPath, { recursive: true });
		try {
			await fs.writeFile(this.headPath, "", { flag: "wx" });
			// wx: open for writing, fail if file exists

			await fs.writeFile(this.indexPath, JSON.stringify([]), {
				flag: "wx",
			});

			console.log("Initialised an empty groot repository");
		} catch (error) {
			console.log("Already initialised the .groot folder");
		}
	}

	/* 
        Create a hash using sha1 algorithm
    */
	hashObject(content) {
		return crypto.createHash("sha1").update(content, "utf-8").digest("hex");
	}

	/* 
        Read the file and add it to the staging area
    */
	async add(fileToBeAdded) {
		// fileToBeAdded : path/to/file

		// read the file
		const fileData = await fs.readFile(fileToBeAdded, {
			encoding: "utf-8",
		});

		// hash the file
		const fileHash = this.hashObject(fileData);
		console.log(fileHash);

		// .groot/objects/abc123
		const newHashedFileObjectPath = path.join(this.objectsPath, fileHash);

		await fs.writeFile(newHashedFileObjectPath, fileData);

		await this.updateStagingArea(fileToBeAdded, fileHash);

		console.log("File added", fileToBeAdded);
	}

	async updateStagingArea(filePath, fileHash) {
		// read the index file or staging area data
		const index = JSON.parse(
			await fs.readFile(this.indexPath, { encoding: "utf-8" })
		);

		// add the file to index
		index.push({ path: filePath, hash: fileHash });

		// write the updated index file
		await fs.writeFile(this.indexPath, JSON.stringify(index));
	}

	/* 
		Create a commit with message
	*/
	async commit(message) {
		const index = JSON.parse(
			await fs.readFile(this.indexPath, { encoding: "utf-8" })
		);
		const parentCommit = await this.getCurrentHead();

		const commitData = {
			timeStamp: new Date().toISOString(),
			message,
			files: index,
			parent: parentCommit,
		};

		const commitHash = this.hashObject(JSON.stringify(commitData));

		const commitPath = path.join(this.objectsPath, commitHash);

		await fs.writeFile(commitPath, JSON.stringify(commitData));

		// update HEAD to point to a new commit
		await fs.writeFile(this.headPath, commitHash);

		// clear the staging area
		await fs.writeFile(this.indexPath, JSON.stringify([]));

		console.log("Commit successfully created:", commitHash);
	}

	async getCurrentHead() {
		try {
			return await fs.readFile(this.headPath, { encoding: "utf-8" });
		} catch (error) {
			return null;
		}
	}

	/* 
		Log all the commits
	*/
	async log() {
		let currentCommitHash = await this.getCurrentHead();
		while (currentCommitHash) {
			const commitData = JSON.parse(
				await fs.readFile(
					path.join(this.objectsPath, currentCommitHash),
					{ encoding: "utf-8" }
				)
			);

			console.log("Commit: ", currentCommitHash);
			console.log();
			console.log("Date: ", commitData.timeStamp, commitData.message);

			currentCommitHash = commitData.parent;
		}
	}

	/* 
		Show the diff b/w the two commits
	*/
	async showCommitDiff(commitHash) {
		const commitData = JSON.parse(await this.getCommitData(commitHash));

		if (!commitData) {
			console.log("Commit not found");
			return;
		}

		console.log("Changes in the last commit are: ");

		for (const file of commitData.files) {
			console.log("File", file.path);
			const fileContent = await this.getFileContent(file.hash);
			console.log(fileContent);

			if (commitData.parent) {
				// get the parent commit data
				const parentCommitData = JSON.parse(
					await this.getCommitData(commitData.parent)
				);

				const parentFileContent = await this.getParentFileContent(
					parentCommitData,
					file.path
				);

				if (parentFileContent) {
					console.log("Diff: ");

					const diff = diffLines(parentFileContent, fileContent);

					console.log(diff);

					diff.forEach((part) => {
						if (part.added) {
							process.stdout.write("++", chalk.green(part.value));
						} else if (part.removed) {
							process.stdout.write("--", chalk.red(part.value));
						} else {
							process.stdout.write(chalk.gray(part.value));
						}
					});
					console.log();
				} else {
					console.log("New File Content");
				}
			} else {
				console.log("First Commit");
			}
		}
	}

	async getParentFileContent(parentCommitData, filePath) {
		const parentFile = parentCommitData.files.find(
			(file) => file.path === filePath
		);

		if (parentFile) {
			// get the file content from the parent commit
			// and then return the content
			return await this.getFileContent(parentFile.hash);
		}
	}

	/* 
		Get any commit and through its 
	*/
	async getCommitData(commitHash) {
		const commitPath = path.join(this.objectsPath, commitHash);

		try {
			return await fs.readFile(commitPath, { encoding: "utf-8" });
		} catch (error) {
			console.log("Failed to read the commit data: ", error);
			return null;
		}
	}

	async getFileContent(fileHash) {
		const objectPath = path.join(this.objectsPath, fileHash);

		return fs.readFile(objectPath, { encoding: "utf-8" });
	}
}

// (async () => {
// 	const groot = new Groot();
// 	await groot.add("sample.txt");
// 	await groot.commit("Initial commit");
// })();

program.command("init").action(async () => {
	const groot = new Groot();
});

program.command("add <file>").action(async (file) => {
	const groot = new Groot();
	await groot.add(file);
});

program.command("commit <message>").action(async (message) => {
	const groot = new Groot();
	await groot.commit(message);
});

program.command("log").action(async () => {
	const groot = new Groot();
	await groot.log();
});

program.command("show <commitHash>").action(async (commitHash) => {
	const groot = new Groot();
	await groot.showCommitDiff(commitHash);
});

program.parse(process.argv);
