import React from 'react';
import type { DocumentInfo } from '..';

export const index = (css: string, lastSaved: string, email: string, domainPermissions: string, files: DocumentInfo[], baseUrl: string) => <html>
<head>
	<title>Guardian Visuals - docs</title>
	<style type="text/css">{ css }</style>
</head>
<body>


	<div className="header">
		<style type="text/css">{`
			.header {
				background-color: #00558b;
				overflow: auto;
			}
			.header__logo {
				display: block;
				max-width: 1300px;
				text-align: right;
				font-family: 'Guardian Text Egyptian Web';
				font-size: 24px;
				margin: auto;
				font-weight: bold;
				line-height: 48px;
			}
			.header__logo span:first-child {
				color: #aad8f2;
			}
			.header__logo span:last-child {
				color: #fff;
			}
			.header__logo a {
				text-decoration: none;
			}`}
		</style>
		<h2 className="header__logo">
			<a href="/">
				<span>Visuals</span><span>Intraweb</span>
			</a>
		</h2>
	</div>
	<div className="container">

		<h2>
			Files
			<span className="last-updated">
				last updated:
				<time dateTime={ lastSaved } title={ lastSaved }>
					{ lastSaved }
				</time>
				<a href="log">log</a>
			</span>
		</h2>

		<p className="note"><b>This tool is only supported during UK office hours</b></p>


		<p className="note">To add a document to this list share it with <span>{email}</span>. Updates may take a few minutes to come through.</p>

		<table>
			<thead>
				<tr>
					<th>Title</th>
					<th>Last Modified</th>
					<th>By</th>
					<th>@{ domainPermissions }</th>
					<th>Links</th>
					<th></th>
				</tr>
			</thead>

			<tbody>
				{ files.map((file) => 
				<tr key={file.id} className={`domainpermissions--${file.domainPermissions}`}>
					<td><img src={ file.iconLink || undefined }/>{ file.title }</td>
					<td title={ file.modifiedDate || undefined }>{ file.modifiedDate }</td>
					<td>{ file.lastModifyingUserName }</td>
					<td><span className={`permission permission--${file.domainPermissions}`}>{ file.domainPermissions }</span></td>
					<td>
						<a className="docs" href={ file.urlDocs || undefined }>docs</a> /
						{ file.isTable ?
							<><a className="table-embed" target="_blank" href={`https://interactive.guim.co.uk/atoms/2020/08/table-tool/embed/app/main.html?spreadsheet=${ file.id }`}>table url</a> /</>
							: null
						}
						<a className={ file.isTestCurrent ? "current" : "old" }
							href={ file.urlTest }>test</a>
						{ file.urlProd ?
							<>/ <a className={ file.isProdCurrent ? "current" : "old" }
							     href={ file.urlProd }>
								prod</a></>
							: null }
					</td>
					<td>
						{ !file.isProdCurrent ?
							<form method="POST" action={`${baseUrl}/publish`}>
								<input type="hidden" name="id" value={ file.id } />
								<button className="btn btn--blue">publish</button>
							</form>
							:
							<button className="btn btn--blue" disabled={true}>up-to-date</button>
						}
					</td>
					</tr>
				)}
			</tbody>
		</table>
	</div>
</body>
</html>
